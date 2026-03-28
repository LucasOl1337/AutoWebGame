import {
  ARENA_OFFSET_X,
  ARENA_OFFSET_Y,
  BASE_MOVE_MS,
  BOMB_FUSE_MS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FIXED_STEP_MS,
  FLAME_DURATION_MS,
  GRID_HEIGHT,
  GRID_WIDTH,
  HUD_HEIGHT,
  KEY_BINDINGS,
  MIN_MOVE_MS,
  PLAYER_COLORS,
  ROUND_DURATION_MS,
  ROUND_END_DELAY_MS,
  SKILL_KEY,
  SPEED_STEP_MS,
  TARGET_WINS,
  TILE_SIZE,
} from "../core/config";
import {
  spriteForDirection,
  type CharacterRosterEntry,
  type DirectionalSprites,
  type GameAssets,
} from "./assets";
import { pickAnimationFrame } from "./animation-frame";
import { SpriteTrimCache, type SpriteTrimBounds } from "./sprite-trim-cache";
import {
  ALL_PLAYER_IDS,
  MENU_PLAYER_IDS,
} from "../core/types";
import type {
  ArenaState,
  BombState,
  CharacterSkillId,
  Direction,
  FlameState,
  MatchScore,
  MenuPlayerId,
  Mode,
  PixelCoord,
  PlayerId,
  PlayerState,
  PowerUpState,
  RoundOutcome,
  TileCoord,
} from "../core/types";
import { InputManager, NoopInputManager, type InputController } from "../engine/input";
import { createArena, isWrapPortalTile, tileKey } from "../game/arena";
import {
  applyPowerUpToPlayer,
  formatControlKey,
  getPowerUpDefinition,
  getPowerUpLevel,
  getPowerUpPriorityScore,
  type SkillPowerUpType,
  SKILL_POWER_UP_TYPES,
} from "../core/powerups";
import type {
  MatchStartConfig,
  OnlineGameFrame,
  OnlineGameSnapshot,
  OnlineInputState,
  OnlineSessionBridge,
} from "../online/protocol";
import { SoundManager, SFX_MANIFEST } from "./sound-manager";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

const directionDelta: Record<Direction, TileCoord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const PLAYER_HITBOX_HALF = TILE_SIZE * 0.5;
const LANE_SNAP_THRESHOLD = TILE_SIZE * 0.45;
const LANE_LOCK_THRESHOLD = 3;
const LANE_SETTLE_EPSILON = 0.35;
const LANE_SNAP_FACTOR = 2.6;
const CHARACTER_MENU_KEYS: Record<MenuPlayerId, string> = {
  1: "KeyG",
  2: "KeyK",
};
const LOCAL_BOT_TOGGLE_KEY = "KeyB";
const LOCAL_BOT_CYCLE_KEY = "KeyN";
const MAX_LOCAL_BOT_FILL = 3;
const BOT_BOMB_COOLDOWN_MS = 900;
const BOT_DANGER_FUSE_MS = 1000;
const BOT_DANGER_ARRIVAL_BUFFER_MS = 140;
const BOT_SCAN_RADIUS = 7;
const BOT_SUDDEN_DEATH_LOOKAHEAD_MS = 2100;
const BOT_STRATEGIC_MOVE_WINDOW_STEPS = 2;
const BOT_PREEMPTIVE_ESCAPE_STEPS = 4;
const BOT_DIRECTION_CONFIRM_FRAMES = 2;
const WALK_FRAME_MS = 100;
const SKILL_FRAME_MS = 100;
const SPAWN_PROTECTION_MS = 2200;
const RANNI_CHARACTER_ID = "03a976fb-7313-4064-a477-5bb9b0760034";
const RANNI_SKILL_CHANNEL_MS = 2_000;
const RANNI_SKILL_COOLDOWN_MS = 10_000;
const SUDDEN_DEATH_ELAPSED_MS = 40_000;
const SUDDEN_DEATH_START_MS = ROUND_DURATION_MS - SUDDEN_DEATH_ELAPSED_MS;
const SUDDEN_DEATH_TICK_MS = 800;
const SUDDEN_DEATH_FLAME_MS = 900;
const SHIELD_GUARD_MS = 600;
const DANGER_OVERLAY_MAX_ETA_MS = BOMB_FUSE_MS + 600;
const CANVAS_BACKBUFFER_SCALE = 2;
const CANVAS_VIEWPORT_PADDING = 32;
const PLAYER_SPRITE_HEIGHT_SCALE = 1.45;
const PLAYER_SPRITE_MAX_WIDTH_SCALE = 1.2;
const ONLINE_SNAPSHOT_INTERVAL_MS = 50;
const ONLINE_RENDER_SMOOTHING = 0.48;
const ONLINE_INTERPOLATION_DELAY_MS = 52;
const ONLINE_EXTRAPOLATION_MS = 42;
const ONLINE_VELOCITY_LEAD_MS = 18;
const ONLINE_MAX_VISUAL_LEAD_PX = TILE_SIZE * 0.34;
const ONLINE_SAMPLE_BUFFER_SIZE = 12;
const ARENA_PIXEL_WIDTH = GRID_WIDTH * TILE_SIZE;
const ARENA_PIXEL_HEIGHT = GRID_HEIGHT * TILE_SIZE;
const PLAYER_SPAWNS: Record<PlayerId, { tile: TileCoord; direction: Direction }> = {
  1: { tile: { x: 2, y: 1 }, direction: "down" },
  2: { tile: { x: GRID_WIDTH - 3, y: 1 }, direction: "down" },
  3: { tile: { x: 2, y: GRID_HEIGHT - 2 }, direction: "up" },
  4: { tile: { x: GRID_WIDTH - 3, y: GRID_HEIGHT - 2 }, direction: "up" },
};

interface OnlineRenderSample {
  receivedAtMs: number;
  serverTimeMs: number;
  serverTick: number;
  players: Record<PlayerId, { position: PixelCoord; velocity: PixelCoord }>;
}

interface PendingOnlineInput {
  seq: number;
  input: OnlineInputState;
}

function createNeutralOnlineInput(): OnlineInputState {
  return {
    direction: null,
    bombPressed: false,
    detonatePressed: false,
    skillPressed: false,
  };
}

function cloneOnlineInputState(input: OnlineInputState): OnlineInputState {
  return {
    direction: input.direction,
    bombPressed: input.bombPressed,
    detonatePressed: input.detonatePressed,
    skillPressed: input.skillPressed,
  };
}

function createDefaultPlayerSkillState(skillId: CharacterSkillId | null) {
  return {
    id: skillId,
    phase: "idle" as const,
    channelRemainingMs: 0,
    cooldownRemainingMs: 0,
    castElapsedMs: 0,
    projectedPosition: null,
    projectedLastMoveDirection: null,
  };
}

function createEmptyDirectionalSprites(): DirectionalSprites {
  return {
    up: null,
    down: null,
    left: null,
    right: null,
    idle: { up: [], down: [], left: [], right: [] },
    walk: { up: [], down: [], left: [], right: [] },
    run: { up: [], down: [], left: [], right: [] },
    cast: { up: [], down: [], left: [], right: [] },
    attack: { up: [], down: [], left: [], right: [] },
  };
}

function createPlayerRecord<T>(factory: (playerId: PlayerId) => T): Record<PlayerId, T> {
  return {
    1: factory(1),
    2: factory(2),
    3: factory(3),
    4: factory(4),
  };
}

function createBooleanPlayerRecord(value: boolean): Record<PlayerId, boolean> {
  return createPlayerRecord(() => value);
}

function createNumberPlayerRecord(value: number): Record<PlayerId, number> {
  return createPlayerRecord(() => value);
}

function createDirectionPlayerRecord(value: Direction | null): Record<PlayerId, Direction | null> {
  return createPlayerRecord(() => value);
}

function normalizeActivePlayerIds(playerIds: PlayerId[]): PlayerId[] {
  const unique = Array.from(new Set(playerIds.filter((playerId): playerId is PlayerId => (
    ALL_PLAYER_IDS as readonly number[]
  ).includes(playerId)))) as PlayerId[];
  return unique.length > 0 ? unique : [1, 2];
}

function createHeadlessCanvas(): {
  width: number;
  height: number;
  style: Record<string, string>;
  setAttribute: () => void;
  getContext: (_kind?: string) => CanvasRenderingContext2D;
} {
  const noop = () => undefined;
  const fakeContext = {
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    stroke: noop,
    fill: noop,
    arc: noop,
    ellipse: noop,
    drawImage: noop,
    fillText: noop,
    strokeText: noop,
    save: noop,
    restore: noop,
  } as unknown as CanvasRenderingContext2D;
  fakeContext.imageSmoothingEnabled = false;
  return {
    width: CANVAS_WIDTH * CANVAS_BACKBUFFER_SCALE,
    height: CANVAS_HEIGHT * CANVAS_BACKBUFFER_SCALE,
    style: {},
    setAttribute: noop,
    getContext: () => fakeContext,
  };
}

interface BotDecision {
  direction: Direction | null;
  placeBomb: boolean;
  detonate?: boolean;
}

interface MovementOption {
  direction: Direction;
  horizontal: boolean;
  laneTarget: number;
  canAdvanceForward: boolean;
  combinedMove: PixelCoord;
  laneOnlyMove: PixelCoord;
  forwardOnlyMove: PixelCoord;
  combinedFree: boolean;
  laneOnlyFree: boolean;
  forwardOnlyFree: boolean;
}

interface HudSkillSlot {
  type: SkillPowerUpType;
  level: number;
  acquired: boolean;
  keyLabel: string | null;
  valueLabel: string;
}

export class GameApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: InputController;
  private readonly root: HTMLElement;
  private readonly assets: GameAssets;
  private readonly headless: boolean;
  private onlineSession: OnlineSessionBridge | null = null;
  private activePlayerIds: PlayerId[] = [1, 2];
  private onlineLocalPlayerId: PlayerId = 1;
  private onlineInputs: Record<PlayerId, OnlineInputState> = createPlayerRecord(() => createNeutralOnlineInput());
  private onlineSnapshotCooldownMs = 0;
  private visualPlayerPositions: Record<PlayerId, PixelCoord> = createPlayerRecord(() => ({ x: 0, y: 0 }));
  private onlineRenderSamples: OnlineRenderSample[] = [];
  private onlineNextInputSeq = 0;
  private onlinePendingInputs: PendingOnlineInput[] = [];
  private onlineObservedRoundNumber: number | null = null;
  private onlineAudioPrimed = false;

  private lastTimestamp = 0;
  private accumulatorMs = 0;

  private mode: Mode = "boot";
  private selectedCharacterIndex: Record<PlayerId, number> = createNumberPlayerRecord(0);
  private pendingCharacterIndex: Record<PlayerId, number> = createNumberPlayerRecord(0);
  private characterLocked: Record<PlayerId, boolean> = createBooleanPlayerRecord(true);
  private characterMenuOpen: Record<PlayerId, boolean> = createBooleanPlayerRecord(false);
  private arena: ArenaState = createArena();
  private players: Record<PlayerId, PlayerState> = this.createPlayers();
  private bombs: BombState[] = [];
  private flames: FlameState[] = [];
  private nextBombId = 1;

  private menuReady: Record<PlayerId, boolean> = createBooleanPlayerRecord(false);
  private matchResultChoice: Record<PlayerId, "rematch" | "lobby" | null> = createPlayerRecord(() => null);
  private score: MatchScore = { 1: 0, 2: 0, 3: 0, 4: 0 };
  private roundNumber = 1;
  private roundTimeMs = ROUND_DURATION_MS;
  private paused = false;
  private roundOutcome: RoundOutcome | null = null;
  private matchWinner: PlayerId | null = null;
  private readonly automationMode = typeof navigator !== "undefined" ? navigator.webdriver : false;
  private automationControlledPlayer: PlayerId = 2;
  private localBotFill = 0;
  private botControlledPlayers: Record<PlayerId, boolean> = createBooleanPlayerRecord(false);
  private botEnabled = false;
  private botBombCooldownMs = 0;
  private botCommittedDirection: Record<PlayerId, Direction | null> = createDirectionPlayerRecord(null);
  private botPendingReverseDirection: Record<PlayerId, Direction | null> = createDirectionPlayerRecord(null);
  private botPendingReverseFrames: Record<PlayerId, number> = createNumberPlayerRecord(0);
  private animationClockMs = 0;
  private suddenDeathActive = false;
  private suddenDeathTickMs = SUDDEN_DEATH_TICK_MS;
  private suddenDeathIndex = 0;
  private suddenDeathPath: TileCoord[] = [];
  private showDangerOverlay = false;
  private showBombPreview = false;
  private readonly characterRoster: CharacterRosterEntry[];
  private readonly spriteTrimCache = new SpriteTrimCache();
  private readonly soundManager = new SoundManager();

  constructor(root: HTMLElement, assets: GameAssets) {
    this.root = root;
    this.assets = assets;
    this.headless = typeof document === "undefined" || typeof window === "undefined";

    if (this.headless) {
      const fakeCanvas = createHeadlessCanvas();
      this.canvas = fakeCanvas as unknown as HTMLCanvasElement;
      this.ctx = fakeCanvas.getContext("2d") as CanvasRenderingContext2D;
      this.input = new NoopInputManager();
    } else {
      this.canvas = document.createElement("canvas");
      this.canvas.width = CANVAS_WIDTH * CANVAS_BACKBUFFER_SCALE;
      this.canvas.height = CANVAS_HEIGHT * CANVAS_BACKBUFFER_SCALE;
      this.canvas.setAttribute("aria-label", "BOMBA game canvas");

      const ctx = this.canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas 2D context not available");
      }
      this.ctx = ctx;
      this.ctx.setTransform(CANVAS_BACKBUFFER_SCALE, 0, 0, CANVAS_BACKBUFFER_SCALE, 0, 0);
      this.ctx.imageSmoothingEnabled = false;
      this.input = new InputManager(window);
    }
    const configuredRoster = this.assets.characterRoster ?? [];
    const fallbackRoster: CharacterRosterEntry[] = [
      { id: "default-p1", name: "Default P1", size: null, sprites: this.assets.players[1] ?? createEmptyDirectionalSprites() },
      { id: "default-p2", name: "Default P2", size: null, sprites: this.assets.players[2] ?? createEmptyDirectionalSprites() },
    ];
    this.characterRoster = configuredRoster.length > 0
      ? configuredRoster
      : fallbackRoster;
    const playerOneIndex = this.findDefaultCharacterIndex(1, 0);
    const playerTwoIndex = this.findDefaultCharacterIndex(2, Math.min(1, this.characterRoster.length - 1));
    this.selectedCharacterIndex = {
      1: playerOneIndex,
      2: playerTwoIndex,
      3: this.findDefaultCharacterIndex(3, playerOneIndex),
      4: this.findDefaultCharacterIndex(4, playerTwoIndex),
    };
    this.pendingCharacterIndex = { ...this.selectedCharacterIndex };
    this.applyOfflineBotFill(this.automationMode ? 1 : 0, false);
  }

  public attachOnlineSession(session: OnlineSessionBridge): void {
    this.onlineSession = session;
    this.activePlayerIds = [1, 2];
    this.localBotFill = 0;
    this.botControlledPlayers = createBooleanPlayerRecord(false);
    this.botEnabled = false;
    this.menuReady = createBooleanPlayerRecord(false);
    this.matchResultChoice = createPlayerRecord(() => null);
    this.onlineLocalPlayerId = 1;
    this.onlineInputs = createPlayerRecord(() => createNeutralOnlineInput());
    this.onlineNextInputSeq = 0;
    this.onlinePendingInputs = [];
    this.onlineObservedRoundNumber = null;
    this.onlineAudioPrimed = false;
    this.onlineRenderSamples = [];
    this.syncPlayerLabels();
  }

  public startOnlineMatch(config: MatchStartConfig): void {
    this.activePlayerIds = normalizeActivePlayerIds(config.activePlayerIds);
    this.onlineLocalPlayerId = config.localPlayerId;
    this.onlineNextInputSeq = 0;
    this.onlinePendingInputs = [];
    this.onlineInputs = createPlayerRecord(() => createNeutralOnlineInput());
    this.onlineAudioPrimed = false;
    this.onlineRenderSamples = [];
    this.selectedCharacterIndex = { ...config.characterSelections };
    this.pendingCharacterIndex = { ...config.characterSelections };
    this.characterLocked = createBooleanPlayerRecord(true);
    this.characterMenuOpen = createBooleanPlayerRecord(false);
    this.matchResultChoice = createPlayerRecord(() => null);
    this.localBotFill = 0;
    this.botControlledPlayers = createBooleanPlayerRecord(false);

    if (config.role === "host") {
      this.startMatch();
      return;
    }
    this.soundManager.playOneShot("matchStart");
    this.mode = "match";
    this.botEnabled = false;
    this.matchWinner = null;
    this.paused = false;
    this.roundOutcome = null;
    this.menuReady = createBooleanPlayerRecord(false);
    for (const playerId of this.activePlayerIds) {
      this.menuReady[playerId] = true;
    }
  }

  public applyOnlineSnapshot(snapshot: OnlineGameSnapshot): void {
    const previousMode = this.mode;
    this.playOnlineAudioTransition({
      bombs: snapshot.bombs,
      flames: snapshot.flames,
      players: snapshot.players,
      roundOutcome: snapshot.roundOutcome,
      matchWinner: snapshot.matchWinner,
      suddenDeathActive: snapshot.suddenDeathActive,
      breakableTiles: snapshot.breakableTiles,
      powerUps: snapshot.powerUps,
    });
    const baseArena = createArena();
    this.mode = snapshot.mode;
    this.arena = {
      solid: baseArena.solid,
      breakable: new Set(snapshot.breakableTiles),
      powerUps: snapshot.powerUps.map((powerUp) => ({
        type: powerUp.type,
        tile: { ...powerUp.tile },
        revealed: powerUp.revealed,
        collected: powerUp.collected,
      })),
    };
    this.players = createPlayerRecord((playerId) => this.clonePlayerState(snapshot.players[playerId]));
    this.bombs = snapshot.bombs.map((bomb) => ({
      ...bomb,
      tile: { ...bomb.tile },
    }));
    this.flames = snapshot.flames.map((flame) => ({
      ...flame,
      tile: { ...flame.tile },
    }));
    this.nextBombId = snapshot.nextBombId;
    this.score = { ...snapshot.score };
    this.roundNumber = snapshot.roundNumber;
    this.roundTimeMs = snapshot.roundTimeMs;
    this.paused = snapshot.paused;
    this.roundOutcome = snapshot.roundOutcome
      ? { ...snapshot.roundOutcome }
      : null;
    this.matchWinner = snapshot.matchWinner;
    this.animationClockMs = snapshot.animationClockMs;
    this.suddenDeathActive = snapshot.suddenDeathActive;
    this.suddenDeathTickMs = snapshot.suddenDeathTickMs;
    this.suddenDeathIndex = snapshot.suddenDeathIndex;
    this.showDangerOverlay = snapshot.showDangerOverlay;
    this.showBombPreview = snapshot.showBombPreview;
    this.selectedCharacterIndex = { ...snapshot.selectedCharacterIndex };
    this.pendingCharacterIndex = { ...snapshot.selectedCharacterIndex };
    this.characterLocked = createBooleanPlayerRecord(true);
    this.characterMenuOpen = createBooleanPlayerRecord(false);
    this.activePlayerIds = normalizeActivePlayerIds(snapshot.activePlayerIds);
    this.localBotFill = 0;
    this.botControlledPlayers = createBooleanPlayerRecord(false);
    this.botEnabled = false;
    this.matchResultChoice = createPlayerRecord(() => null);
    this.resetOnlineRoundBuffers(snapshot.roundNumber);
    this.pushOnlineRenderSample(snapshot.serverTimeMs, snapshot.serverTick, snapshot.players);
    this.nextBombId = snapshot.nextBombId;
    this.reconcileGuestState(snapshot.ackedInputSeq[this.onlineLocalPlayerId] ?? 0);

    if (previousMode !== "match" || this.visualPlayerPositions[this.onlineLocalPlayerId].x === 0) {
      this.syncVisualPlayerPositions();
    }
    this.onlineAudioPrimed = true;
  }

  public applyOnlineFrame(frame: OnlineGameFrame): void {
    const previousMode = this.mode;
    this.playOnlineAudioTransition({
      bombs: frame.bombs,
      flames: frame.flames,
      players: frame.players,
      roundOutcome: frame.roundOutcome,
      matchWinner: frame.matchWinner,
      suddenDeathActive: frame.suddenDeathActive,
    });
    this.mode = frame.mode;
    this.players = createPlayerRecord((playerId) => this.clonePlayerState(frame.players[playerId]));
    this.bombs = frame.bombs.map((bomb) => ({
      ...bomb,
      tile: { ...bomb.tile },
    }));
    this.flames = frame.flames.map((flame) => ({
      ...flame,
      tile: { ...flame.tile },
    }));
    this.score = { ...frame.score };
    this.roundNumber = frame.roundNumber;
    this.roundTimeMs = frame.roundTimeMs;
    this.paused = frame.paused;
    this.roundOutcome = frame.roundOutcome ? { ...frame.roundOutcome } : null;
    this.matchWinner = frame.matchWinner;
    this.animationClockMs = frame.animationClockMs;
    this.suddenDeathActive = frame.suddenDeathActive;
    this.suddenDeathTickMs = frame.suddenDeathTickMs;
    this.suddenDeathIndex = frame.suddenDeathIndex;
    this.selectedCharacterIndex = { ...frame.selectedCharacterIndex };
    this.pendingCharacterIndex = { ...frame.selectedCharacterIndex };
    this.activePlayerIds = normalizeActivePlayerIds(frame.activePlayerIds);
    this.localBotFill = 0;
    this.botControlledPlayers = createBooleanPlayerRecord(false);
    this.nextBombId = frame.nextBombId;
    this.resetOnlineRoundBuffers(frame.roundNumber);
    this.pushOnlineRenderSample(frame.serverTimeMs, frame.serverTick, frame.players);
    this.reconcileGuestState(frame.ackedInputSeq[this.onlineLocalPlayerId] ?? 0);

    if (previousMode !== "match" || this.visualPlayerPositions[this.onlineLocalPlayerId].x === 0) {
      this.syncVisualPlayerPositions();
    }
    this.onlineAudioPrimed = true;
  }

  public clearOnlinePeer(): void {
    this.resetToLobbyState();
    this.onlineInputs = createPlayerRecord(() => createNeutralOnlineInput());
    this.onlineNextInputSeq = 0;
    this.onlinePendingInputs = [];
    this.onlineObservedRoundNumber = null;
    this.onlineAudioPrimed = false;
    this.onlineRenderSamples = [];
    this.botEnabled = false;
  }

  private resetToLobbyState(): void {
    this.input.clearPresses();
    this.mode = "menu";
    this.activePlayerIds = [1, 2];
    this.onlineLocalPlayerId = 1;
    this.menuReady = createBooleanPlayerRecord(false);
    this.matchResultChoice = createPlayerRecord(() => null);
    this.score = { 1: 0, 2: 0, 3: 0, 4: 0 };
    this.roundNumber = 1;
    this.matchWinner = null;
    this.paused = false;
    this.roundOutcome = null;
    this.botBombCooldownMs = 0;
    this.botCommittedDirection = createDirectionPlayerRecord(null);
    this.botPendingReverseDirection = createDirectionPlayerRecord(null);
    this.botPendingReverseFrames = createNumberPlayerRecord(0);
    this.animationClockMs = 0;
    this.suddenDeathActive = false;
    this.suddenDeathTickMs = SUDDEN_DEATH_TICK_MS;
    this.suddenDeathIndex = 0;
    this.suddenDeathPath = this.buildSuddenDeathPath();
    this.onlineAudioPrimed = false;
    if (!this.onlineSession) {
      this.applyOfflineBotFill(this.localBotFill, false);
    } else {
      this.localBotFill = 0;
      this.botControlledPlayers = createBooleanPlayerRecord(false);
      this.botEnabled = false;
    }
    this.resetRound();
  }

  private playOnlineAudioTransition(next: {
    bombs: BombState[];
    flames: FlameState[];
    players: Record<PlayerId, PlayerState>;
    roundOutcome: RoundOutcome | null;
    matchWinner: PlayerId | null;
    suddenDeathActive: boolean;
    breakableTiles?: string[];
    powerUps?: PowerUpState[];
  }): void {
    if (
      this.headless
      || this.onlineSession?.role !== "guest"
      || !this.onlineAudioPrimed
    ) {
      return;
    }

    const previousBombIds = new Set(this.bombs.map((bomb) => bomb.id));
    const nextBombIds = new Set(next.bombs.map((bomb) => bomb.id));
    const addedBombs = next.bombs.filter((bomb) => !previousBombIds.has(bomb.id)).length;
    const removedBombs = this.bombs.filter((bomb) => !nextBombIds.has(bomb.id)).length;

    const previousFlames = new Set(this.flames.map((flame) => tileKey(flame.tile.x, flame.tile.y)));
    const newFlames = next.flames.filter((flame) => !previousFlames.has(tileKey(flame.tile.x, flame.tile.y))).length;
    const startedSuddenDeath = !this.suddenDeathActive && next.suddenDeathActive;

    if (addedBombs > 0) {
      this.soundManager.playOneShot("bombPlace");
    }
    if (startedSuddenDeath) {
      this.soundManager.playOneShot("suddenDeath");
    }
    if (removedBombs > 0) {
      this.soundManager.playOneShot("bombExplode");
    }
    if (newFlames > 0) {
      this.soundManager.playOneShot("flameIgnite");
    }

    if (next.breakableTiles && this.arena.breakable.size > new Set(next.breakableTiles).size) {
      this.soundManager.playOneShot("crateBreak");
    }

    if (next.powerUps && this.didCollectRemotePowerUp(next.powerUps)) {
      this.soundManager.playOneShot("powerupCollect");
    }

    if (this.didConsumeRemoteShield(next.players)) {
      this.soundManager.playOneShot("shieldBlock");
    }

    if (this.didLoseRemotePlayer(next.players)) {
      this.soundManager.playOneShot("playerDeath");
    }

    if (!this.roundOutcome && next.roundOutcome) {
      this.soundManager.playOneShot(next.matchWinner ? "matchWin" : "roundWin");
    }
  }

  private didCollectRemotePowerUp(nextPowerUps: PowerUpState[]): boolean {
    const previousCollected = new Set(
      this.arena.powerUps
        .filter((powerUp) => powerUp.collected)
        .map((powerUp) => `${powerUp.type}:${tileKey(powerUp.tile.x, powerUp.tile.y)}`),
    );
    return nextPowerUps.some((powerUp) => (
      powerUp.collected
      && !previousCollected.has(`${powerUp.type}:${tileKey(powerUp.tile.x, powerUp.tile.y)}`)
    ));
  }

  private didConsumeRemoteShield(nextPlayers: Record<PlayerId, PlayerState>): boolean {
    return this.activePlayerIds.some((playerId) => (
      this.players[playerId].shieldCharges > nextPlayers[playerId].shieldCharges
      && nextPlayers[playerId].alive
    ));
  }

  private didLoseRemotePlayer(nextPlayers: Record<PlayerId, PlayerState>): boolean {
    return this.activePlayerIds.some((playerId) => this.players[playerId].alive && !nextPlayers[playerId].alive);
  }

  public receiveOnlineGuestInput(input: OnlineInputState): void {
    const playerInput = this.onlineInputs[2];
    this.onlineInputs[2] = {
      direction: input.direction,
      bombPressed: playerInput.bombPressed || input.bombPressed,
      detonatePressed: playerInput.detonatePressed || input.detonatePressed,
      skillPressed: playerInput.skillPressed || input.skillPressed,
    };
  }

  public detachOnlineSession(): void {
    this.onlineSession = null;
    this.clearOnlinePeer();
    this.mode = "menu";
    this.paused = false;
  }

  public start(): void {
    if (this.headless) {
      return;
    }
    void this.soundManager.loadSounds(SFX_MANIFEST);
    this.root.appendChild(this.canvas);
    this.syncCanvasDisplaySize();
    this.mode = "menu";
    this.registerWindowHooks();
    this.render();
    window.requestAnimationFrame(this.loop);
  }

  private readonly loop = (timestamp: number): void => {
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
    }
    const deltaMs = Math.min(50, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;
    this.accumulatorMs += deltaMs;

    while (this.accumulatorMs >= FIXED_STEP_MS) {
      this.update(FIXED_STEP_MS);
      this.accumulatorMs -= FIXED_STEP_MS;
    }

    this.updateVisualPlayerPositions(deltaMs);
    this.render();
    this.input.endFrame();
    window.requestAnimationFrame(this.loop);
  };

  private registerWindowHooks(): void {
    window.addEventListener("resize", this.syncCanvasDisplaySize);
    this.soundManager.bindUnlock(window);
    window.render_game_to_text = () => this.renderGameToText();
    window.advanceTime = (ms: number) => {
      const steps = Math.max(1, Math.round(ms / FIXED_STEP_MS));
      for (let step = 0; step < steps; step += 1) {
        this.update(FIXED_STEP_MS);
      }
      this.render();
      this.input.endFrame();
    };
  }

  private readonly syncCanvasDisplaySize = (): void => {
    if (this.headless || typeof window === "undefined") {
      return;
    }
    if (!("style" in this.canvas)) {
      return;
    }
    const viewport = this.canvas.parentElement;
    const viewportWidth = viewport?.clientWidth
      ?? (typeof window.innerWidth === "number" ? window.innerWidth : CANVAS_WIDTH + CANVAS_VIEWPORT_PADDING);
    const viewportHeight = viewport?.clientHeight
      ?? (typeof window.innerHeight === "number" ? window.innerHeight : CANVAS_HEIGHT + CANVAS_VIEWPORT_PADDING);
    const viewportPadding = viewport ? 12 : CANVAS_VIEWPORT_PADDING;
    const availableWidth = Math.max(160, viewportWidth - viewportPadding);
    const availableHeight = Math.max(160, viewportHeight - viewportPadding);
    const fitScale = Math.min(availableWidth / CANVAS_WIDTH, availableHeight / CANVAS_HEIGHT);
    const displayScale = Math.max(0.5, fitScale);
    const displayWidth = Math.max(1, Math.round(CANVAS_WIDTH * displayScale));
    const displayHeight = Math.max(1, Math.round(CANVAS_HEIGHT * displayScale));
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;
  };

  private captureOnlineLocalInput(): void {
    if (!this.onlineSession) {
      return;
    }
    const localBindings = KEY_BINDINGS[1];
    const input = this.onlineInputs[this.onlineLocalPlayerId];
    input.direction = this.input.getMovementDirection(1);
    input.bombPressed = input.bombPressed || this.input.consumePress(localBindings.bomb);
    input.detonatePressed = input.detonatePressed || this.input.consumePress(localBindings.detonate);
    input.skillPressed = input.skillPressed || this.input.consumePress(SKILL_KEY);
  }

  private forwardGuestInput(): void {
    if (this.onlineSession?.role !== "guest") {
      return;
    }
    const nextInput = cloneOnlineInputState(this.onlineInputs[this.onlineLocalPlayerId]);
    const inputSeq = this.onlineNextInputSeq + 1;
    this.onlineNextInputSeq = inputSeq;
    this.onlineSession.sendGuestInput(nextInput, inputSeq);
    this.onlinePendingInputs.push({ seq: inputSeq, input: nextInput });
    if (this.onlinePendingInputs.length > 180) {
      this.onlinePendingInputs.splice(0, this.onlinePendingInputs.length - 180);
    }
  }

  private flushOnlineSnapshot(deltaMs: number): void {
    if (
      this.onlineSession?.role !== "host"
      || (this.mode !== "match" && this.mode !== "match-result")
    ) {
      this.onlineSnapshotCooldownMs = 0;
      return;
    }
    this.onlineSnapshotCooldownMs -= deltaMs;
    if (this.onlineSnapshotCooldownMs > 0) {
      return;
    }
    this.onlineSnapshotCooldownMs = ONLINE_SNAPSHOT_INTERVAL_MS;
    this.onlineSession.sendHostSnapshot(this.createOnlineSnapshot());
  }

  private createOnlineSnapshot(): OnlineGameSnapshot {
    return {
      mode: this.mode,
      serverTimeMs: 0,
      serverTick: 0,
      frameId: 0,
      ackedInputSeq: createNumberPlayerRecord(0),
      breakableTiles: Array.from(this.arena.breakable),
      powerUps: this.arena.powerUps.map((powerUp) => ({
        type: powerUp.type,
        tile: { ...powerUp.tile },
        revealed: powerUp.revealed,
        collected: powerUp.collected,
      })),
      players: createPlayerRecord((playerId) => this.clonePlayerState(this.players[playerId])),
      bombs: this.bombs.map((bomb) => ({
        ...bomb,
        tile: { ...bomb.tile },
      })),
      flames: this.flames.map((flame) => ({
        ...flame,
        tile: { ...flame.tile },
      })),
      nextBombId: this.nextBombId,
      score: { ...this.score },
      roundNumber: this.roundNumber,
      roundTimeMs: this.roundTimeMs,
      paused: this.paused,
      roundOutcome: this.roundOutcome ? { ...this.roundOutcome } : null,
      matchWinner: this.matchWinner,
      animationClockMs: this.animationClockMs,
      suddenDeathActive: this.suddenDeathActive,
      suddenDeathTickMs: this.suddenDeathTickMs,
      suddenDeathIndex: this.suddenDeathIndex,
      showDangerOverlay: this.showDangerOverlay,
      showBombPreview: this.showBombPreview,
      selectedCharacterIndex: { ...this.selectedCharacterIndex },
      activePlayerIds: [...this.activePlayerIds],
    };
  }

  private clonePlayerState(player: PlayerState): PlayerState {
    const skill = player.skill ?? createDefaultPlayerSkillState(this.getPlayerSkillId(player.id));
    return {
      ...player,
      tile: { ...player.tile },
      position: { ...player.position },
      velocity: { ...player.velocity },
      skill: {
        ...skill,
        projectedPosition: skill.projectedPosition ? { ...skill.projectedPosition } : null,
      },
    };
  }

  private update(deltaMs: number): void {
    if (this.onlineSession?.role === "guest") {
      if (this.mode === "match") {
        if (!this.headless) {
          this.captureOnlineLocalInput();
        }
        this.forwardGuestInput();
        this.updateGuestLocalPrediction(deltaMs);
      } else if (this.mode === "match-result") {
        this.updateMatchResult();
      }
      return;
    }

    if (this.onlineSession && !this.headless) {
      this.captureOnlineLocalInput();
    }

    switch (this.mode) {
      case "menu":
        this.updateMenu();
        break;
      case "match":
        this.updateMatch(deltaMs);
        break;
      case "match-result":
        this.updateMatchResult();
        break;
      default:
        break;
    }

    if (this.onlineSession?.role === "host") {
      this.flushOnlineSnapshot(deltaMs);
    }
  }

  public startServerAuthoritativeMatch(activePlayerIds: PlayerId[], characterSelections: Record<PlayerId, number>): void {
    this.onlineSession = {
      role: "host",
      roomCode: "server",
      sendGuestInput: (_input: OnlineInputState, _inputSeq: number) => undefined,
      sendHostSnapshot: () => undefined,
      sendMatchResultChoice: () => false,
    };
    this.activePlayerIds = normalizeActivePlayerIds(activePlayerIds);
    this.onlineLocalPlayerId = 1;
    this.onlineInputs = createPlayerRecord(() => createNeutralOnlineInput());
    this.onlineNextInputSeq = 0;
    this.onlinePendingInputs = [];
    this.onlineObservedRoundNumber = null;
    this.onlineRenderSamples = [];
    this.selectedCharacterIndex = { ...characterSelections };
    this.pendingCharacterIndex = { ...characterSelections };
    this.characterLocked = createBooleanPlayerRecord(true);
    this.characterMenuOpen = createBooleanPlayerRecord(false);
    this.localBotFill = 0;
    this.botControlledPlayers = createBooleanPlayerRecord(false);
    this.botEnabled = false;
    this.startMatch();
  }

  public setServerPlayerInput(playerId: PlayerId, input: OnlineInputState): void {
    const target = this.onlineInputs[playerId];
    this.onlineInputs[playerId] = {
      direction: input.direction,
      bombPressed: target.bombPressed || input.bombPressed,
      detonatePressed: target.detonatePressed || input.detonatePressed,
      skillPressed: target.skillPressed || input.skillPressed,
    };
  }

  public advanceServerSimulation(deltaMs: number): void {
    const steps = Math.max(1, Math.round(deltaMs / FIXED_STEP_MS));
    for (let step = 0; step < steps; step += 1) {
      this.update(FIXED_STEP_MS);
    }
    this.input.endFrame();
  }

  public exportOnlineSnapshot(): OnlineGameSnapshot {
    return this.createOnlineSnapshot();
  }

  private syncVisualPlayerPositions(): void {
    this.visualPlayerPositions = createPlayerRecord((playerId) => this.getPlayerPixelPositionFromState(this.players[playerId]));
  }

  private pushOnlineRenderSample(
    serverTimeMs: number,
    serverTick: number,
    players: Record<PlayerId, PlayerState>,
  ): void {
    if (this.headless || typeof performance === "undefined") {
      return;
    }
    const sample = {
      receivedAtMs: performance.now(),
      serverTimeMs,
      serverTick,
      players: createPlayerRecord((playerId) => ({
        position: this.getPlayerPixelPositionFromState(players[playerId]),
        velocity: { x: players[playerId].velocity.x, y: players[playerId].velocity.y },
      })),
    };
    const previousSample = this.onlineRenderSamples[this.onlineRenderSamples.length - 1] ?? null;
    if (previousSample && previousSample.serverTick === sample.serverTick) {
      this.onlineRenderSamples[this.onlineRenderSamples.length - 1] = sample;
    } else {
      this.onlineRenderSamples.push(sample);
      if (this.onlineRenderSamples.length > ONLINE_SAMPLE_BUFFER_SIZE) {
        this.onlineRenderSamples.splice(0, this.onlineRenderSamples.length - ONLINE_SAMPLE_BUFFER_SIZE);
      }
    }
  }

  private updateGuestLocalPrediction(deltaMs: number): void {
    if (!this.onlineSession || this.onlineSession.role !== "guest" || this.mode !== "match" || this.paused || this.roundOutcome) {
      return;
    }

    const localId = this.onlineLocalPlayerId;
    const player = this.players[localId];
    if (!player || !player.alive) {
      return;
    }
    this.simulatePlayerInputStep(
      player,
      {
        direction: this.getMovementDirection(localId),
        bombPressed: this.consumeOnlineBombPress(localId),
        detonatePressed: this.consumeOnlineDetonatePress(localId),
        skillPressed: this.consumeOnlineSkillPress(localId),
      },
      deltaMs,
    );
  }

  private reconcileGuestState(ackedInputSeq: number): void {
    if (!this.onlineSession || this.onlineSession.role !== "guest") {
      return;
    }
    if (this.mode !== "match") {
      this.onlinePendingInputs = [];
      return;
    }

    this.onlinePendingInputs = this.onlinePendingInputs.filter((pending) => pending.seq > ackedInputSeq);
    const localPlayer = this.players[this.onlineLocalPlayerId];
    if (!localPlayer || !localPlayer.alive) {
      return;
    }

    for (const pending of this.onlinePendingInputs) {
      this.applyPredictedInputStep(localPlayer, pending.input, FIXED_STEP_MS);
    }
  }

  private resetOnlineRoundBuffers(roundNumber: number): void {
    if (!this.onlineSession) {
      return;
    }
    if (this.onlineObservedRoundNumber === roundNumber) {
      return;
    }
    this.onlineObservedRoundNumber = roundNumber;
    this.onlinePendingInputs = [];
    this.onlineRenderSamples = [];
    this.onlineInputs = createPlayerRecord(() => createNeutralOnlineInput());
    this.syncVisualPlayerPositions();
  }

  private applyPredictedInputStep(player: PlayerState, input: OnlineInputState, deltaMs: number): void {
    this.simulatePlayerInputStep(player, input, deltaMs);
  }

  private simulatePlayerInputStep(player: PlayerState, input: OnlineInputState, deltaMs: number): boolean {
    player.spawnProtectionMs = Math.max(0, player.spawnProtectionMs - deltaMs);
    player.flameGuardMs = Math.max(0, player.flameGuardMs - deltaMs);
    this.syncPlayerSkill(player);
    this.advancePlayerSkillTimers(player, deltaMs);

    if (input.skillPressed) {
      this.activatePlayerSkill(player);
    }

    if (this.updatePlayerSkillChannel(player, input.direction, deltaMs)) {
      player.tile = this.getTileFromPosition(player.position);
      return false;
    }

    let placedBomb = false;
    if (input.bombPressed) {
      placedBomb = this.placeBomb(player);
    }
    if (input.detonatePressed) {
      this.triggerRemoteDetonation(player);
    }

    if (input.direction) {
      const actualDirection = this.resolveMovementDirection(player, input.direction, deltaMs);
      player.direction = actualDirection;
      this.movePlayer(player, actualDirection, deltaMs);
    } else {
      player.velocity.x = 0;
      player.velocity.y = 0;
    }
    player.tile = this.getTileFromPosition(player.position);
    return placedBomb;
  }

  private syncPlayerSkill(player: PlayerState): void {
    const expectedSkillId = this.getPlayerSkillId(player.id);
    if (player.skill.id === expectedSkillId) {
      return;
    }
    player.skill = createDefaultPlayerSkillState(expectedSkillId);
  }

  private advancePlayerSkillTimers(player: PlayerState, deltaMs: number): void {
    if (player.skill.phase !== "cooldown") {
      return;
    }
    player.skill.cooldownRemainingMs = Math.max(0, player.skill.cooldownRemainingMs - deltaMs);
    if (player.skill.cooldownRemainingMs <= 0) {
      player.skill.phase = "idle";
      player.skill.castElapsedMs = 0;
    }
  }

  private activatePlayerSkill(player: PlayerState): void {
    if (!player.alive || player.skill.id !== "ranni-ice-blink" || player.skill.phase !== "idle") {
      return;
    }
    player.skill.phase = "channeling";
    player.skill.channelRemainingMs = RANNI_SKILL_CHANNEL_MS;
    player.skill.castElapsedMs = 0;
    player.skill.projectedPosition = { ...player.position };
    player.skill.projectedLastMoveDirection = player.lastMoveDirection;
    player.velocity.x = 0;
    player.velocity.y = 0;
  }

  private updatePlayerSkillChannel(player: PlayerState, desiredDirection: Direction | null, deltaMs: number): boolean {
    if (player.skill.id !== "ranni-ice-blink" || player.skill.phase !== "channeling") {
      return false;
    }

    player.velocity.x = 0;
    player.velocity.y = 0;
    if (!player.skill.projectedPosition) {
      player.skill.projectedPosition = { ...player.position };
    }
    if (desiredDirection) {
      const simulated = this.simulateProjectedMovement(
        player,
        player.skill.projectedPosition,
        desiredDirection,
        player.skill.projectedLastMoveDirection,
        deltaMs,
      );
      player.skill.projectedPosition = simulated.position;
      player.skill.projectedLastMoveDirection = simulated.lastMoveDirection;
      player.direction = simulated.direction;
    }

    player.skill.channelRemainingMs = Math.max(0, player.skill.channelRemainingMs - deltaMs);
    player.skill.castElapsedMs += deltaMs;
    if (player.skill.channelRemainingMs <= 0) {
      this.finishRanniBlink(player);
    }
    return true;
  }

  private finishRanniBlink(player: PlayerState): void {
    if (player.skill.id !== "ranni-ice-blink") {
      return;
    }
    const target = player.skill.projectedPosition ?? player.position;
    if (this.canOccupyPosition(player, target)) {
      player.position = { ...target };
      player.tile = this.getTileFromPosition(player.position);
    }
    if (player.skill.projectedLastMoveDirection) {
      player.lastMoveDirection = player.skill.projectedLastMoveDirection;
      player.direction = player.skill.projectedLastMoveDirection;
    }
    player.velocity.x = 0;
    player.velocity.y = 0;
    player.skill.phase = "cooldown";
    player.skill.channelRemainingMs = 0;
    player.skill.cooldownRemainingMs = RANNI_SKILL_COOLDOWN_MS;
    player.skill.castElapsedMs = 0;
    player.skill.projectedPosition = null;
    player.skill.projectedLastMoveDirection = null;
  }

  private isPlayerImmuneDuringSkillChannel(player: PlayerState): boolean {
    return player.skill.id === "ranni-ice-blink" && player.skill.phase === "channeling";
  }

  private simulateProjectedMovement(
    player: PlayerState,
    startPosition: PixelCoord,
    desiredDirection: Direction,
    projectedLastMoveDirection: Direction | null,
    deltaMs: number,
  ): { position: PixelCoord; lastMoveDirection: Direction | null; direction: Direction } {
    const ghost = this.clonePlayerState(player);
    ghost.position = { ...startPosition };
    ghost.tile = this.getTileFromPosition(startPosition);
    ghost.velocity = { x: 0, y: 0 };
    ghost.lastMoveDirection = projectedLastMoveDirection;
    const actualDirection = this.resolveMovementDirection(ghost, desiredDirection, deltaMs);
    ghost.direction = actualDirection;
    this.movePlayerSimulated(ghost, actualDirection, deltaMs);
    return {
      position: { ...ghost.position },
      lastMoveDirection: ghost.lastMoveDirection,
      direction: ghost.direction,
    };
  }

  private updateVisualPlayerPositions(deltaMs: number): void {
    if (this.headless || !this.onlineSession) {
      this.syncVisualPlayerPositions();
      return;
    }

    const frameBlend = 1 - Math.pow(1 - ONLINE_RENDER_SMOOTHING, Math.max(1, deltaMs) / FIXED_STEP_MS);
    const nowMs = typeof performance === "undefined" ? 0 : performance.now();
    for (const id of this.activePlayerIds) {
      const player = this.players[id];
      const target = this.getPlayerPixelPositionFromState(player);
      if (id === this.onlineLocalPlayerId) {
        this.visualPlayerPositions[id] = target;
        continue;
      }

      let projected = this.projectNetworkPlayerPosition(id, nowMs, target, player.velocity);
      const current = this.visualPlayerPositions[id];

      const offsetX = projected.x - target.x;
      const offsetY = projected.y - target.y;
      const offsetDistance = Math.hypot(offsetX, offsetY);
      if (offsetDistance > ONLINE_MAX_VISUAL_LEAD_PX && offsetDistance > 0.001) {
        const scale = ONLINE_MAX_VISUAL_LEAD_PX / offsetDistance;
        projected = {
          x: target.x + offsetX * scale,
          y: target.y + offsetY * scale,
        };
      }

      this.visualPlayerPositions[id] = {
        x: current.x + (projected.x - current.x) * frameBlend,
        y: current.y + (projected.y - current.y) * frameBlend,
      };
    }
  }

  private projectNetworkPlayerPosition(
    playerId: PlayerId,
    nowMs: number,
    fallbackPosition: PixelCoord,
    fallbackVelocity: PixelCoord,
  ): PixelCoord {
    const samples = this.onlineRenderSamples;
    const latestSample = samples[samples.length - 1] ?? null;
    const currentSample = latestSample?.players[playerId] ?? null;
    if (!currentSample || !latestSample) {
      return {
        x: fallbackPosition.x + fallbackVelocity.x * (ONLINE_VELOCITY_LEAD_MS / 1000),
        y: fallbackPosition.y + fallbackVelocity.y * (ONLINE_VELOCITY_LEAD_MS / 1000),
      };
    }

    const renderAtMs = nowMs - ONLINE_INTERPOLATION_DELAY_MS;
    const oldestSample = samples[0] ?? latestSample;
    if (renderAtMs <= oldestSample.receivedAtMs) {
      const oldestPlayer = oldestSample.players[playerId];
      return {
        x: oldestPlayer.position.x,
        y: oldestPlayer.position.y,
      };
    }

    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const next = samples[index];
      if (renderAtMs < previous.receivedAtMs || renderAtMs > next.receivedAtMs) {
        continue;
      }
      const previousSample = previous.players[playerId];
      const nextSample = next.players[playerId];
      const spanMs = Math.max(1, next.receivedAtMs - previous.receivedAtMs);
      const alpha = Math.max(0, Math.min(1, (renderAtMs - previous.receivedAtMs) / spanMs));
      return {
        x: previousSample.position.x + (nextSample.position.x - previousSample.position.x) * alpha,
        y: previousSample.position.y + (nextSample.position.y - previousSample.position.y) * alpha,
      };
    }

    const extrapolationMs = Math.max(
      0,
      Math.min(ONLINE_EXTRAPOLATION_MS, renderAtMs - latestSample.receivedAtMs),
    );
    return {
      x: currentSample.position.x + currentSample.velocity.x * (extrapolationMs / 1000),
      y: currentSample.position.y + currentSample.velocity.y * (extrapolationMs / 1000),
    };
  }

  private updateMenu(): void {
    if (this.onlineSession) {
      return;
    }

    if (this.input.consumePress(LOCAL_BOT_CYCLE_KEY)) {
      this.applyOfflineBotFill((this.localBotFill + 1) % (MAX_LOCAL_BOT_FILL + 1));
    }

    if (this.input.consumePress(LOCAL_BOT_TOGGLE_KEY)) {
      this.applyOfflineBotFill(this.localBotFill > 0 ? 0 : 1);
    }

    this.handleCharacterSelectionInput();
    if (this.isAnyCharacterMenuOpen()) {
      return;
    }

    for (const playerId of this.activePlayerIds) {
      if (this.isBotControlled(playerId)) {
        this.menuReady[playerId] = true;
      }
    }

    if (this.automationMode && this.input.consumePress("Enter")) {
      this.menuReady = createBooleanPlayerRecord(false);
      for (const playerId of this.activePlayerIds) {
        this.menuReady[playerId] = true;
      }
    }
    this.handleReadyInput(this.menuReady);
    if (this.activePlayerIds.every((playerId) => this.menuReady[playerId])) {
      this.startMatch();
    }
  }

  private updateMatch(deltaMs: number): void {
    if (!this.roundOutcome && this.input.consumePress("Escape")) {
      this.paused = !this.paused;
    }

    if (!this.onlineSession) {
      this.handleCharacterSelectionInput();
      if (this.isAnyCharacterMenuOpen()) {
        return;
      }
    }

    if (this.automationMode) {
      if (this.input.consumePress("KeyA")) {
        this.automationControlledPlayer = 1;
      }
      if (this.input.consumePress("KeyB")) {
        this.automationControlledPlayer = 2;
      }
    }

    if (this.paused) {
      return;
    }

    if (this.roundOutcome) {
      this.roundOutcome.countdownMs -= deltaMs;
      if (this.roundOutcome.countdownMs <= 0) {
        this.advanceAfterRound();
      }
      return;
    }

    this.roundTimeMs = Math.max(0, this.roundTimeMs - deltaMs);
    this.animationClockMs += deltaMs;
    if (this.roundTimeMs <= 0) {
      this.finishRound(null, "timer", "Clock hit zero. Draw round.");
      return;
    }

    this.updateSuddenDeath(deltaMs);
    this.botBombCooldownMs = Math.max(0, this.botBombCooldownMs - deltaMs);
    this.updatePlayers(deltaMs);
    this.updateBombs(deltaMs);
    this.updateFlames(deltaMs);
    this.collectPowerUps();
    this.evaluateRoundState();
  }

  private updateMatchResult(): void {
    if (this.onlineSession?.role === "guest") {
      const choice = this.consumeMatchResultChoiceInputForPlayer(1);
      if (choice) {
        this.matchResultChoice[this.onlineLocalPlayerId] = choice;
        this.onlineSession.sendMatchResultChoice(choice);
        if (choice === "lobby") {
          this.resetToLobbyState();
        }
      }
      return;
    }

    for (const playerId of this.activePlayerIds) {
      if (this.isBotControlled(playerId)) {
        this.matchResultChoice[playerId] = "rematch";
      }
    }

    if (this.automationMode && this.input.consumePress("Enter")) {
      this.matchResultChoice = createPlayerRecord(() => null);
      for (const playerId of this.activePlayerIds) {
        this.matchResultChoice[playerId] = "rematch";
      }
    }
    for (const playerId of MENU_PLAYER_IDS) {
      const choice = this.consumeMatchResultChoiceInputForPlayer(playerId);
      if (choice) {
        this.matchResultChoice[playerId] = choice;
      }
    }
    if (this.matchResultChoice[1] === "lobby" || this.matchResultChoice[2] === "lobby") {
      this.resetToLobbyState();
      return;
    }
    if (this.activePlayerIds.every((playerId) => this.matchResultChoice[playerId] === "rematch")) {
      this.startMatch();
    }
  }

  private handleReadyInput(readyState: Record<PlayerId, boolean>): void {
    for (const playerId of MENU_PLAYER_IDS) {
      if (!this.activePlayerIds.includes(playerId)) {
        continue;
      }
      if (this.isBotControlled(playerId)) {
        continue;
      }
      if (this.input.consumePress(KEY_BINDINGS[playerId].ready)) {
        readyState[playerId] = !readyState[playerId];
      }
    }
  }

  private consumeMatchResultChoiceInputForPlayer(playerId: MenuPlayerId): "rematch" | "lobby" | null {
    const bindings = KEY_BINDINGS[playerId];
    if (this.input.consumePress(bindings.bomb)) {
      return "rematch";
    }
    if (this.input.consumePress(bindings.detonate)) {
      return "lobby";
    }
    return null;
  }

  private handleCharacterSelectionInput(): void {
    for (const id of MENU_PLAYER_IDS) {
      if (!this.input.consumePress(CHARACTER_MENU_KEYS[id])) {
        continue;
      }
      const opening = !this.characterMenuOpen[id];
      this.characterMenuOpen[id] = opening;
      if (opening) {
        this.pendingCharacterIndex[id] = this.selectedCharacterIndex[id];
        this.characterLocked[id] = false;
      }
    }

    for (const id of MENU_PLAYER_IDS) {
      if (!this.characterMenuOpen[id]) {
        continue;
      }
      if (this.input.consumePress(KEY_BINDINGS[id].up)) {
        this.cycleCharacterSelection(id, -1);
      }
      if (this.input.consumePress(KEY_BINDINGS[id].down)) {
        this.cycleCharacterSelection(id, 1);
      }
      if (this.input.consumePress(KEY_BINDINGS[id].ready)) {
        this.lockCharacterSelection(id);
      }
    }
  }

  private cycleCharacterSelection(playerId: PlayerId, delta: number): void {
    const total = this.characterRoster.length;
    if (total <= 0) {
      return;
    }
    const current = this.pendingCharacterIndex[playerId];
    this.pendingCharacterIndex[playerId] = (current + delta + total) % total;
  }

  private lockCharacterSelection(playerId: PlayerId): void {
    this.selectedCharacterIndex[playerId] = this.pendingCharacterIndex[playerId];
    this.characterLocked[playerId] = true;
    this.characterMenuOpen[playerId] = false;
  }

  private isAnyCharacterMenuOpen(): boolean {
    return MENU_PLAYER_IDS.some((playerId) => this.characterMenuOpen[playerId]);
  }

  private applyOfflineBotFill(botFill: number, preserveP1Ready = true): void {
    if (this.onlineSession) {
      return;
    }
    const nextFill = Math.max(0, Math.min(MAX_LOCAL_BOT_FILL, Math.floor(botFill)));
    this.localBotFill = nextFill;
    const nextActivePlayerIds: PlayerId[] = nextFill === 0
      ? [1, 2]
      : ([1, ...ALL_PLAYER_IDS.slice(1, 1 + nextFill)] as PlayerId[]);
    this.activePlayerIds = normalizeActivePlayerIds(nextActivePlayerIds);
    this.botControlledPlayers = createBooleanPlayerRecord(false);
    if (nextFill > 0) {
      for (const playerId of this.activePlayerIds) {
        if (playerId !== 1) {
          this.botControlledPlayers[playerId] = true;
        }
      }
    }
    this.botEnabled = this.botControlledPlayers[2];
    const nextReady = createBooleanPlayerRecord(false);
    nextReady[1] = preserveP1Ready ? this.menuReady[1] : false;
    for (const playerId of this.activePlayerIds) {
      if (playerId !== 1 && this.isBotControlled(playerId)) {
        nextReady[playerId] = true;
      }
    }
    this.menuReady = nextReady;
    this.matchResultChoice = createPlayerRecord(() => null);
    this.syncPlayerLabels();
  }

  private startMatch(): void {
    // Prevent queued key presses from previous screens leaking into active gameplay.
    this.input.clearPresses();
    this.soundManager.playOneShot("matchStart");
    this.menuReady = createBooleanPlayerRecord(false);
    this.matchResultChoice = createPlayerRecord(() => null);
    this.score = { 1: 0, 2: 0, 3: 0, 4: 0 };
    this.roundNumber = 1;
    this.matchWinner = null;
    this.resetRound();
    this.mode = "match";
  }

  private resetRound(): void {
    this.arena = createArena();
    this.players = this.createPlayers();
    this.bombs = [];
    this.flames = [];
    this.nextBombId = 1;
    this.roundTimeMs = ROUND_DURATION_MS;
    this.roundOutcome = null;
    this.paused = false;
    this.botBombCooldownMs = 0;
    this.botCommittedDirection = createDirectionPlayerRecord(null);
    this.botPendingReverseDirection = createDirectionPlayerRecord(null);
    this.botPendingReverseFrames = createNumberPlayerRecord(0);
    this.animationClockMs = 0;
    this.suddenDeathActive = false;
    this.suddenDeathTickMs = SUDDEN_DEATH_TICK_MS;
    this.suddenDeathIndex = 0;
    this.suddenDeathPath = this.buildSuddenDeathPath();
  }

  private createPlayers(): Record<PlayerId, PlayerState> {
    const players = createPlayerRecord((playerId) => {
      const spawn = PLAYER_SPAWNS[playerId];
      const name = this.isBotControlled(playerId) ? "BOT" : `P${playerId}`;
      return this.createPlayer(playerId, name, spawn.tile, spawn.direction, this.activePlayerIds.includes(playerId));
    });
    this.visualPlayerPositions = createPlayerRecord((playerId) => this.getPlayerPixelPositionFromState(players[playerId]));
    return players;
  }

  private syncPlayerLabels(): void {
    for (const playerId of ALL_PLAYER_IDS) {
      this.players[playerId].name = this.isBotControlled(playerId) ? "BOT" : `P${playerId}`;
    }
  }

  private getCharacterEntry(index: number): CharacterRosterEntry {
    const total = this.characterRoster.length;
    const normalized = ((index % total) + total) % total;
    return this.characterRoster[normalized];
  }

  private findDefaultCharacterIndex(playerId: PlayerId, fallbackIndex: number): number {
    const configuredIndex = this.characterRoster.findIndex((entry) => entry.defaultSlot === playerId);
    if (configuredIndex >= 0) {
      return configuredIndex;
    }
    return fallbackIndex;
  }

  private getActiveCharacterEntry(playerId: PlayerId): CharacterRosterEntry {
    return this.getCharacterEntry(this.selectedCharacterIndex[playerId]);
  }

  private getPreviewCharacterEntry(playerId: PlayerId): CharacterRosterEntry {
    const index = this.characterMenuOpen[playerId]
      ? this.pendingCharacterIndex[playerId]
      : this.selectedCharacterIndex[playerId];
    return this.getCharacterEntry(index);
  }

  private getPlayerSprites(playerId: PlayerId): DirectionalSprites {
    return this.getActiveCharacterEntry(playerId).sprites;
  }

  private getPlayerSkillId(playerId: PlayerId): CharacterSkillId | null {
    const characterId = this.getActiveCharacterEntry(playerId).id;
    if (characterId === RANNI_CHARACTER_ID) {
      return "ranni-ice-blink";
    }
    return null;
  }

  private getCharacterLabel(playerId: PlayerId, maxLength = 18): string {
    return this.shortenCharacterName(this.getActiveCharacterEntry(playerId).name, maxLength);
  }

  private getPlayerSlotLabel(playerId: PlayerId): string {
    return this.isBotControlled(playerId) ? "BOT" : `P${playerId}`;
  }

  private shortenCharacterName(name: string, maxLength = 30): string {
    if (name.length <= maxLength) {
      return name;
    }
    return `${name.slice(0, maxLength - 3)}...`;
  }

  private createPlayer(
    id: PlayerId,
    name: string,
    tile: TileCoord,
    direction: Direction,
    active: boolean,
  ): PlayerState {
    const center = this.getTileCenter(tile);
    return {
      id,
      name,
      active,
      tile: { ...tile },
      position: center,
      velocity: { x: 0, y: 0 },
      alive: active,
      direction,
      lastMoveDirection: null,
      maxBombs: 1,
      activeBombs: 0,
      flameRange: 1,
      speedLevel: 0,
      remoteLevel: 0,
      shieldCharges: 0,
      bombPassLevel: 0,
      kickLevel: 0,
      flameGuardMs: 0,
      spawnProtectionMs: SPAWN_PROTECTION_MS,
      skill: createDefaultPlayerSkillState(null),
    };
  }

  private updatePlayers(deltaMs: number): void {
    for (const id of this.activePlayerIds) {
      const player = this.players[id];
      if (!player.alive) {
        continue;
      }

      const botDecision = this.isBotControlled(id) ? this.getBotDecision(player) : null;
      const automationBomb = this.automationMode
        ? this.automationControlledPlayer === id && this.input.consumePress("Space")
        : false;
      const onlineBomb = this.consumeOnlineBombPress(id);
      const nativeBindings = MENU_PLAYER_IDS.includes(id as MenuPlayerId)
        ? KEY_BINDINGS[id as MenuPlayerId]
        : null;
      const nativeBomb = this.shouldUseNativeControls()
        ? nativeBindings ? this.input.consumePress(nativeBindings.bomb) : false
        : false;
      const wantsBomb = botDecision?.placeBomb || automationBomb || nativeBomb || onlineBomb;
      if (wantsBomb) {
        const placedBomb = this.placeBomb(player);
        if (placedBomb && botDecision?.placeBomb && this.isBotControlled(id)) {
          this.botBombCooldownMs = BOT_BOMB_COOLDOWN_MS;
        }
      }
      const wantsDetonate = botDecision?.detonate
        || this.consumeOnlineDetonatePress(id)
        || (this.shouldUseNativeControls()
          ? nativeBindings ? this.input.consumePress(nativeBindings.detonate) : false
          : false);
      const wantsSkill = this.consumeOnlineSkillPress(id)
        || (this.shouldUseNativeControls()
          ? id === 1 && this.input.consumePress(SKILL_KEY)
          : false);

      const desiredDirection = botDecision?.direction ?? this.getMovementDirection(id);
      const direction = this.isBotControlled(id)
        ? this.getStableBotDirection(player, desiredDirection, deltaMs)
        : desiredDirection;
      const placedBomb = this.simulatePlayerInputStep(
        player,
        {
          direction,
          bombPressed: wantsBomb,
          detonatePressed: wantsDetonate,
          skillPressed: wantsSkill,
        },
        deltaMs,
      );
      if (this.isBotControlled(id) && direction && player.skill.phase !== "channeling") {
        this.rememberBotDirection(id, player.direction);
      }
      if (placedBomb && botDecision?.placeBomb && this.isBotControlled(id)) {
        this.botBombCooldownMs = BOT_BOMB_COOLDOWN_MS;
      }
    }

    this.resolvePlayerDeathsFromFlames();
  }

  private getMovementDirection(id: PlayerId): Direction | null {
    if (this.isBotControlled(id)) {
      return null;
    }
    if (this.onlineSession) {
      const input = this.onlineInputs[id];
      if (input) {
        return input.direction;
      }
    }
    if (this.automationMode) {
      if (this.automationControlledPlayer === id) {
        return this.input.getMovementDirection(2) ?? this.input.getMovementDirection(1);
      }
      return null;
    }
    if (MENU_PLAYER_IDS.includes(id as MenuPlayerId)) {
      return this.input.getMovementDirection(id as MenuPlayerId);
    }
    return null;
  }

  private isBotControlled(id: PlayerId): boolean {
    return Boolean(this.botControlledPlayers?.[id]) && this.activePlayerIds.includes(id);
  }

  private shouldUseNativeControls(): boolean {
    if (this.onlineSession) {
      return false;
    }
    return true;
  }

  private consumeOnlineBombPress(id: PlayerId): boolean {
    if (!this.onlineSession) {
      return false;
    }
    const source = this.onlineInputs[id];
    if (!source) {
      return false;
    }
    const pressed = source.bombPressed;
    source.bombPressed = false;
    return pressed;
  }

  private consumeOnlineDetonatePress(id: PlayerId): boolean {
    if (!this.onlineSession) {
      return false;
    }
    const source = this.onlineInputs[id];
    if (!source) {
      return false;
    }
    const pressed = source.detonatePressed;
    source.detonatePressed = false;
    return pressed;
  }

  private consumeOnlineSkillPress(id: PlayerId): boolean {
    if (!this.onlineSession) {
      return false;
    }
    const source = this.onlineInputs[id];
    if (!source) {
      return false;
    }
    const pressed = source.skillPressed;
    source.skillPressed = false;
    return pressed;
  }

  private getOverlappingBomb(player: PlayerState): BombState | null {
    let bestMatch: BombState | null = null;
    for (const bomb of this.bombs) {
      if (!this.isPlayerOverlappingTile(player, bomb.tile)) {
        continue;
      }
      if (!bestMatch || bomb.fuseMs < bestMatch.fuseMs || (bomb.ownerId === player.id && bestMatch.ownerId !== player.id)) {
        bestMatch = bomb;
      }
    }
    return bestMatch;
  }

  private getThreateningOwnedBomb(player: PlayerState, playerTile: TileCoord): BombState | null {
    const playerTileKey = tileKey(playerTile.x, playerTile.y);
    let bestMatch: BombState | null = null;
    for (const bomb of this.bombs) {
      if (bomb.ownerId !== player.id) {
        continue;
      }
      const blastKeys = this.getBombBlastKeys(bomb.tile, bomb.flameRange);
      if (!blastKeys.has(playerTileKey)) {
        continue;
      }
      if (!bestMatch || bomb.fuseMs < bestMatch.fuseMs) {
        bestMatch = bomb;
      }
    }
    return bestMatch;
  }

  private getBotDecision(player: PlayerState): BotDecision {
    const enemy = this.players[1];
    const playerTile = this.getTileFromPosition(player.position);
    const dangerMap = this.getDangerMap();
    const moveDuration = this.getMoveDuration(player);
    const strategicSafetyWindowMs = moveDuration * BOT_STRATEGIC_MOVE_WINDOW_STEPS + BOT_DANGER_ARRIVAL_BUFFER_MS;
    const overlappingBomb = this.getOverlappingBomb(player);

    if (overlappingBomb) {
      const overlappingBlast = this.getBombBlastKeys(
        overlappingBomb.tile,
        this.players[overlappingBomb.ownerId].flameRange,
      );
      const committedEscape = this.findDirectionToNearestTile(
        player,
        (tile) => (
          !overlappingBlast.has(tileKey(tile.x, tile.y))
          && this.countSafeNeighbors(player, tile, dangerMap) >= 1
        ),
        dangerMap,
      );
      const fallbackEscape = this.findDirectionToNearestTile(
        player,
        (tile) => !overlappingBlast.has(tileKey(tile.x, tile.y)),
        dangerMap,
      );
      if (committedEscape || fallbackEscape) {
        return {
          direction: committedEscape ?? fallbackEscape,
          placeBomb: false,
        };
      }
    }

    const threateningOwnedBomb = this.getThreateningOwnedBomb(player, playerTile);
    if (threateningOwnedBomb) {
      const ownBlastKeys = this.getBombBlastKeys(threateningOwnedBomb.tile, threateningOwnedBomb.flameRange);
      const committedEscape = this.findDirectionToNearestTile(
        player,
        (tile) => (
          !ownBlastKeys.has(tileKey(tile.x, tile.y))
          && this.countSafeNeighbors(player, tile, dangerMap) >= 1
        ),
        dangerMap,
        moveDuration + BOT_DANGER_ARRIVAL_BUFFER_MS,
      );
      const fallbackEscape = this.findDirectionToNearestTile(
        player,
        (tile) => !ownBlastKeys.has(tileKey(tile.x, tile.y)),
        dangerMap,
      );
      if (committedEscape || fallbackEscape) {
        return {
          direction: committedEscape ?? fallbackEscape,
          placeBomb: false,
        };
      }
    }

    const playerTileKey = tileKey(playerTile.x, playerTile.y);
    const currentDangerMs = dangerMap.get(playerTileKey);
    const preemptiveDangerMs = moveDuration * BOT_PREEMPTIVE_ESCAPE_STEPS + BOT_DANGER_ARRIVAL_BUFFER_MS;
    const shouldPreemptivelyEscape = currentDangerMs !== undefined && currentDangerMs <= preemptiveDangerMs;
    if (shouldPreemptivelyEscape) {
      const plannedEscape = this.findDirectionToNearestTile(
        player,
        (tile) => this.countSafeNeighbors(player, tile, dangerMap) >= 1,
        dangerMap,
        strategicSafetyWindowMs,
      );
      const immediateEscape = this.findDirectionToNearestTile(
        player,
        (tile) => this.isTileSafeForArrival(dangerMap, tile, this.getMoveDuration(player)),
        dangerMap,
      );
      if (plannedEscape || immediateEscape) {
        return {
          direction: plannedEscape ?? immediateEscape,
          placeBomb: false,
        };
      }
    }
    const nowDanger = currentDangerMs !== undefined && currentDangerMs <= moveDuration + BOT_DANGER_ARRIVAL_BUFFER_MS;

    if (nowDanger) {
      const prioritizedEscape = this.findDirectionToNearestTile(
        player,
        (tile) => this.countSafeNeighbors(player, tile, dangerMap) >= 1,
        dangerMap,
      );
      const fallbackEscape = this.findDirectionToNearestTile(
        player,
        (tile) => this.isTileSafeForArrival(dangerMap, tile, this.getMoveDuration(player)),
        dangerMap,
      );
      return {
        direction: prioritizedEscape ?? fallbackEscape,
        placeBomb: false,
      };
    }

    const suddenDeathDirection = this.getSuddenDeathPressureDirection(player, dangerMap);
    if (suddenDeathDirection) {
      return { direction: suddenDeathDirection, placeBomb: false };
    }

    const enemyVulnerable = enemy.alive && enemy.spawnProtectionMs <= 0;
    const openingProtected = player.spawnProtectionMs > 0;
    const remoteDetonationBomb = this.getRemoteDetonationBomb(player, enemy, enemyVulnerable);
    if (remoteDetonationBomb) {
      return { direction: null, placeBomb: false, detonate: true };
    }
    const adjacentEnemy = enemyVulnerable && this.getTileDistance(playerTile, enemy.tile) <= 1;
    const enemyInBombLine = enemyVulnerable && this.canBombReachTile(playerTile, enemy.tile, player.flameRange);
    const adjacentBreakable = this.hasAdjacentBreakable(playerTile);
    const shouldDropBomb = !openingProtected
      && (adjacentEnemy || adjacentBreakable || enemyInBombLine)
      && this.canBotPlaceBomb(player);
    if (shouldDropBomb) {
      return { direction: null, placeBomb: true };
    }

    const powerUpTarget = this.findValuablePowerUpDirection(player, strategicSafetyWindowMs);
    if (powerUpTarget) {
      return { direction: powerUpTarget, placeBomb: false };
    }

    const breakableTarget = this.findNearestReachableTarget(
      player,
      (tile) => this.hasAdjacentBreakable(tile) && this.canBotPlaceBombAtTile(player, tile, false),
      strategicSafetyWindowMs,
    );
    if (breakableTarget) {
      return { direction: breakableTarget, placeBomb: false };
    }

    const attackPositionTarget = this.findNearestReachableTarget(
      player,
      (tile) => (
        enemyVulnerable
        && this.canBombReachTile(tile, enemy.tile, player.flameRange)
        && this.canBotPlaceBombAtTile(player, tile, false)
      ),
      strategicSafetyWindowMs,
    );
    if (attackPositionTarget) {
      return { direction: attackPositionTarget, placeBomb: false };
    }

    const chaseEnemy = this.findDirectionToNearestTile(
      player,
      (tile) => this.getTileDistance(tile, enemy.tile) <= 1,
      undefined,
      strategicSafetyWindowMs,
    );
    const patrolDirection = this.getPatrolDirection(player, dangerMap, moveDuration);
    if (chaseEnemy || patrolDirection) {
      return { direction: chaseEnemy ?? patrolDirection, placeBomb: false };
    }

    return { direction: null, placeBomb: false };
  }

  private canBotPlaceBomb(player: PlayerState): boolean {
    const playerTile = this.getTileFromPosition(player.position);
    return this.canBotPlaceBombAtTile(player, playerTile, true);
  }

  private getOldestOwnedBomb(playerId: PlayerId): BombState | null {
    let selectedBomb: BombState | null = null;
    for (const bomb of this.bombs) {
      if (bomb.ownerId !== playerId) {
        continue;
      }
      if (!selectedBomb || bomb.id < selectedBomb.id) {
        selectedBomb = bomb;
      }
    }
    return selectedBomb;
  }

  private getRemoteDetonationBomb(player: PlayerState, enemy: PlayerState, enemyVulnerable: boolean): BombState | null {
    if (!player.alive || player.remoteLevel <= 0) {
      return null;
    }
    const remoteBomb = this.getOldestOwnedBomb(player.id);
    if (!remoteBomb) {
      return null;
    }

    const blastKeys = this.getBombBlastKeys(remoteBomb.tile, remoteBomb.flameRange);
    const playerTile = this.getTileFromPosition(player.position);
    if (blastKeys.has(tileKey(playerTile.x, playerTile.y))) {
      return null;
    }
    if (enemyVulnerable && blastKeys.has(tileKey(enemy.tile.x, enemy.tile.y))) {
      return remoteBomb;
    }
    return null;
  }

  private canBotPlaceBombAtTile(player: PlayerState, bombTile: TileCoord, respectCooldown: boolean): boolean {
    if (player.activeBombs >= player.maxBombs) {
      return false;
    }
    if (respectCooldown && this.botBombCooldownMs > 0) {
      return false;
    }
    if (this.bombs.some((bomb) => bomb.tile.x === bombTile.x && bomb.tile.y === bombTile.y)) {
      return false;
    }
    const dangerAfterBomb = this.getDangerMap({
      tile: bombTile,
      range: player.flameRange,
      fuseMs: BOMB_FUSE_MS,
    });

    const maxEscapeSteps = Math.max(1, Math.floor((BOMB_FUSE_MS - 250) / this.getMoveDuration(player)));
    const queue: Array<{ tile: TileCoord; distance: number }> = [{ tile: bombTile, distance: 0 }];
    const visited = new Set<string>([tileKey(bombTile.x, bombTile.y)]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }
      const survivesDetonation = this.isTileSafeForArrival(dangerAfterBomb, current.tile, BOMB_FUSE_MS);
      if (current.distance > 0 && survivesDetonation) {
        return true;
      }
      if (current.distance >= maxEscapeSteps) {
        continue;
      }

      const neighbors: TileCoord[] = [
        { x: current.tile.x + 1, y: current.tile.y },
        { x: current.tile.x - 1, y: current.tile.y },
        { x: current.tile.x, y: current.tile.y + 1 },
        { x: current.tile.x, y: current.tile.y - 1 },
      ];

      for (const next of neighbors) {
        const nextKey = tileKey(next.x, next.y);
        if (visited.has(nextKey) || !this.isTilePathableForBot(player, next)) {
          continue;
        }
        visited.add(nextKey);
        queue.push({ tile: next, distance: current.distance + 1 });
      }
    }

    return false;
  }

  private findNearestReachableTarget(
    player: PlayerState,
    predicate: (tile: TileCoord) => boolean,
    minSafetyWindowMs = BOT_DANGER_ARRIVAL_BUFFER_MS,
  ): Direction | null {
    const dangerMap = this.getDangerMap();
    return this.findDirectionToNearestTile(player, predicate, dangerMap, minSafetyWindowMs);
  }

  private findDirectionToNearestTile(
    player: PlayerState,
    predicate: (tile: TileCoord) => boolean,
    blockedDanger?: Map<string, number>,
    minSafetyWindowMs = BOT_DANGER_ARRIVAL_BUFFER_MS,
  ): Direction | null {
    const start = this.getTileFromPosition(player.position);
    const startKey = tileKey(start.x, start.y);
    const queue: Array<{ tile: TileCoord; first: Direction | null; distance: number }> = [
      { tile: start, first: null, distance: 0 },
    ];
    const visited = new Set<string>([startKey]);
    const danger = blockedDanger ?? this.getDangerMap();
    const moveDuration = this.getMoveDuration(player);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      const arrivalMs = current.distance * moveDuration;
      const currentSafe = this.isTileSafeForArrivalWithWindow(danger, current.tile, arrivalMs, minSafetyWindowMs);
      if ((current.tile.x !== start.x || current.tile.y !== start.y) && currentSafe && predicate(current.tile)) {
        return current.first;
      }

      if (current.distance >= BOT_SCAN_RADIUS) {
        continue;
      }

      const neighbors: Array<{ direction: Direction; tile: TileCoord }> = [
        { direction: "up", tile: { x: current.tile.x, y: current.tile.y - 1 } },
        { direction: "down", tile: { x: current.tile.x, y: current.tile.y + 1 } },
        { direction: "left", tile: { x: current.tile.x - 1, y: current.tile.y } },
        { direction: "right", tile: { x: current.tile.x + 1, y: current.tile.y } },
      ];

      for (const neighbor of neighbors) {
        const key = tileKey(neighbor.tile.x, neighbor.tile.y);
        const neighborArrivalMs = (current.distance + 1) * moveDuration;
        if (
          visited.has(key)
          || !this.isTileSafeForArrivalWithWindow(danger, neighbor.tile, neighborArrivalMs, minSafetyWindowMs)
          || !this.isTilePathableForBot(player, neighbor.tile)
        ) {
          continue;
        }
        visited.add(key);
        queue.push({
          tile: neighbor.tile,
          first: current.first ?? neighbor.direction,
          distance: current.distance + 1,
        });
      }
    }

    return null;
  }

  private isTilePathableForBot(player: PlayerState, tile: TileCoord): boolean {
    if (tile.x < 0 || tile.y < 0 || tile.x >= GRID_WIDTH || tile.y >= GRID_HEIGHT) {
      return false;
    }
    const key = tileKey(tile.x, tile.y);
    if (this.arena.solid.has(key) || this.arena.breakable.has(key)) {
      return false;
    }
    const bombOnTile = this.bombs.find((bomb) => bomb.tile.x === tile.x && bomb.tile.y === tile.y);
    if (!bombOnTile) {
      return true;
    }
    if (player.bombPassLevel > 0) {
      return true;
    }
    return bombOnTile.ownerId === player.id && bombOnTile.ownerCanPass;
  }

  private getTileDistance(a: TileCoord, b: TileCoord): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  private canBombReachTile(origin: TileCoord, target: TileCoord, range: number): boolean {
    if (origin.x !== target.x && origin.y !== target.y) {
      return false;
    }

    if (origin.x === target.x) {
      const step = target.y > origin.y ? 1 : -1;
      const distance = Math.abs(target.y - origin.y);
      if (distance > range) {
        return false;
      }
      for (let offset = 1; offset <= distance; offset += 1) {
        const y = origin.y + offset * step;
        const key = tileKey(origin.x, y);
        if (this.arena.solid.has(key)) {
          return false;
        }
        if (this.arena.breakable.has(key)) {
          return y === target.y;
        }
      }
      return true;
    }

    const step = target.x > origin.x ? 1 : -1;
    const distance = Math.abs(target.x - origin.x);
    if (distance > range) {
      return false;
    }
    for (let offset = 1; offset <= distance; offset += 1) {
      const x = origin.x + offset * step;
      const key = tileKey(x, origin.y);
      if (this.arena.solid.has(key)) {
        return false;
      }
      if (this.arena.breakable.has(key)) {
        return x === target.x;
      }
    }
    return true;
  }

  private hasAdjacentBreakable(tile: TileCoord): boolean {
    const neighbors = [
      { x: tile.x + 1, y: tile.y },
      { x: tile.x - 1, y: tile.y },
      { x: tile.x, y: tile.y + 1 },
      { x: tile.x, y: tile.y - 1 },
    ];
    return neighbors.some((neighbor) => this.arena.breakable.has(tileKey(neighbor.x, neighbor.y)));
  }

  private findValuablePowerUpDirection(player: PlayerState, minSafetyWindowMs: number): Direction | null {
    const priorityGroups = new Map<number, Set<string>>();
    for (const powerUp of this.arena.powerUps) {
      if (!powerUp.revealed || powerUp.collected) {
        continue;
      }
      const value = this.getPowerUpPriority(player, powerUp.type);
      if (value <= 0) {
        continue;
      }
      const key = tileKey(powerUp.tile.x, powerUp.tile.y);
      if (!priorityGroups.has(value)) {
        priorityGroups.set(value, new Set<string>());
      }
      priorityGroups.get(value)?.add(key);
    }

    const sortedValues = [...priorityGroups.keys()].sort((a, b) => b - a);
    for (const value of sortedValues) {
      const targetTiles = priorityGroups.get(value);
      if (!targetTiles) {
        continue;
      }
      const direction = this.findNearestReachableTarget(
        player,
        (tile) => targetTiles.has(tileKey(tile.x, tile.y)),
        minSafetyWindowMs,
      );
      if (direction) {
        return direction;
      }
    }

    return null;
  }

  private getPowerUpPriority(player: PlayerState, type: PowerUpState["type"]): number {
    return getPowerUpPriorityScore(player, type);
  }

  private getSuddenDeathPressureDirection(player: PlayerState, danger: Map<string, number>): Direction | null {
    if (!this.suddenDeathActive) {
      return null;
    }
    const start = this.getTileFromPosition(player.position);
    const moveDuration = this.getMoveDuration(player);
    const centerTile = {
      x: Math.floor(GRID_WIDTH / 2),
      y: Math.floor(GRID_HEIGHT / 2),
    };
    const currentDistanceToCenter = this.getTileDistance(start, centerTile);
    const desiredSafetyWindowMs = Math.max(BOT_SUDDEN_DEATH_LOOKAHEAD_MS, moveDuration * 4);

    return this.findDirectionToNearestTile(
      player,
      (tile) => {
        const key = tileKey(tile.x, tile.y);
        const dangerMs = danger.get(key);
        const safeWindow = dangerMs === undefined || dangerMs > desiredSafetyWindowMs;
        if (!safeWindow) {
          return false;
        }

        const distanceToCenter = this.getTileDistance(tile, centerTile);
        const improvesCentering = distanceToCenter < currentDistanceToCenter;
        if (improvesCentering) {
          return true;
        }

        return this.countSafeNeighbors(player, tile, danger) >= 2;
      },
      danger,
    );
  }

  private getPatrolDirection(
    player: PlayerState,
    danger: Map<string, number>,
    moveDuration: number,
  ): Direction | null {
    const playerTile = this.getTileFromPosition(player.position);
    const centerTile = {
      x: Math.floor(GRID_WIDTH / 2),
      y: Math.floor(GRID_HEIGHT / 2),
    };
    const currentCenterDistance = this.getTileDistance(playerTile, centerTile);
    const lastDirection = player.lastMoveDirection ?? player.direction;
    const reverseDirection = lastDirection
      ? lastDirection === "up"
        ? "down"
        : lastDirection === "down"
          ? "up"
          : lastDirection === "left"
            ? "right"
            : "left"
      : null;

    let bestDirection: Direction | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const direction of ["up", "right", "left", "down"] as const) {
      const delta = directionDelta[direction];
      const nextTile = { x: playerTile.x + delta.x, y: playerTile.y + delta.y };
      if (
        !this.isTilePathableForBot(player, nextTile)
        || !this.isTileSafeForArrival(danger, nextTile, moveDuration)
      ) {
        continue;
      }
      const canBombFromTile = this.canBotPlaceBombAtTile(player, nextTile, false);
      if (this.hasAdjacentBreakable(nextTile) && !canBombFromTile) {
        continue;
      }

      let score = this.getTileDistance(nextTile, centerTile);
      if (direction === lastDirection) {
        score -= 0.5;
      }
      if (reverseDirection && direction === reverseDirection) {
        score += 3;
      }
      if (this.getTileDistance(nextTile, centerTile) < currentCenterDistance) {
        score -= 0.25;
      }

      if (score < bestScore) {
        bestScore = score;
        bestDirection = direction;
      }
    }

    return bestDirection;
  }

  private getDangerMap(extraBomb?: { tile: TileCoord; range: number; fuseMs: number }): Map<string, number> {
    const danger = new Map<string, number>();
    const registerDanger = (key: string, fuseMs: number): void => {
      const previous = danger.get(key);
      if (previous === undefined || fuseMs < previous) {
        danger.set(key, fuseMs);
      }
    };

    for (const flame of this.flames) {
      registerDanger(tileKey(flame.tile.x, flame.tile.y), 0);
    }

    const bombsToProject: Array<{ tile: TileCoord; range: number; fuseMs: number; blastKeys: Set<string> }> = this.bombs
      .filter((bomb) => bomb.fuseMs <= BOMB_FUSE_MS + BOT_DANGER_FUSE_MS)
      .map((bomb) => ({
        tile: bomb.tile,
        range: bomb.flameRange,
        fuseMs: Math.max(0, bomb.fuseMs),
        blastKeys: this.getBombBlastKeys(bomb.tile, bomb.flameRange),
      }));

    if (extraBomb) {
      bombsToProject.push({
        tile: extraBomb.tile,
        range: extraBomb.range,
        fuseMs: Math.max(0, extraBomb.fuseMs),
        blastKeys: this.getBombBlastKeys(extraBomb.tile, extraBomb.range),
      });
    }

    let updated = true;
    while (updated) {
      updated = false;
      for (const source of bombsToProject) {
        for (const target of bombsToProject) {
          if (source === target || source.fuseMs >= target.fuseMs) {
            continue;
          }
          if (source.blastKeys.has(tileKey(target.tile.x, target.tile.y))) {
            target.fuseMs = source.fuseMs;
            updated = true;
          }
        }
      }
    }

    for (const bomb of bombsToProject) {
      for (const key of bomb.blastKeys) {
        registerDanger(key, bomb.fuseMs);
      }
    }

    if (this.suddenDeathActive && this.suddenDeathPath.length > 0 && this.suddenDeathIndex < this.suddenDeathPath.length) {
      const nextTickMs = Math.max(0, this.suddenDeathTickMs);
      for (let index = this.suddenDeathIndex; index < this.suddenDeathPath.length; index += 1) {
        const stepFromNow = index - this.suddenDeathIndex;
        const triggerMs = nextTickMs + stepFromNow * SUDDEN_DEATH_TICK_MS;
        const headTile = this.suddenDeathPath[index];
        const tailTile = this.suddenDeathPath[this.suddenDeathPath.length - 1 - index];
        registerDanger(tileKey(headTile.x, headTile.y), triggerMs);
        if (headTile.x !== tailTile.x || headTile.y !== tailTile.y) {
          registerDanger(tileKey(tailTile.x, tailTile.y), triggerMs);
        }
      }
    }

    return danger;
  }

  private getBombBlastKeys(origin: TileCoord, range: number): Set<string> {
    const keys = new Set<string>([tileKey(origin.x, origin.y)]);
    for (const delta of Object.values(directionDelta)) {
      for (let step = 1; step <= range; step += 1) {
        const x = origin.x + delta.x * step;
        const y = origin.y + delta.y * step;
        if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) {
          break;
        }
        const key = tileKey(x, y);
        if (this.arena.solid.has(key)) {
          break;
        }
        keys.add(key);
        if (this.arena.breakable.has(key)) {
          break;
        }
      }
    }
    return keys;
  }

  private isTileSafeForArrival(danger: Map<string, number>, tile: TileCoord, arrivalMs: number): boolean {
    return this.isTileSafeForArrivalWithWindow(danger, tile, arrivalMs, BOT_DANGER_ARRIVAL_BUFFER_MS);
  }

  private isTileSafeForArrivalWithWindow(
    danger: Map<string, number>,
    tile: TileCoord,
    arrivalMs: number,
    minSafetyWindowMs: number,
  ): boolean {
    const key = tileKey(tile.x, tile.y);
    const dangerMs = danger.get(key);
    return dangerMs === undefined || dangerMs > arrivalMs + minSafetyWindowMs;
  }

  private countSafeNeighbors(player: PlayerState, tile: TileCoord, danger: Map<string, number>): number {
    const moveDuration = this.getMoveDuration(player);
    const neighbors = [
      { x: tile.x + 1, y: tile.y },
      { x: tile.x - 1, y: tile.y },
      { x: tile.x, y: tile.y + 1 },
      { x: tile.x, y: tile.y - 1 },
    ];
    let count = 0;
    for (const neighbor of neighbors) {
      if (
        this.isTilePathableForBot(player, neighbor)
        && this.isTileSafeForArrival(danger, neighbor, moveDuration)
      ) {
        count += 1;
      }
    }
    return count;
  }

  private getMoveDuration(player: PlayerState): number {
    return Math.max(MIN_MOVE_MS, BASE_MOVE_MS - player.speedLevel * SPEED_STEP_MS);
  }

  private getMoveSpeed(player: PlayerState): number {
    return TILE_SIZE / (this.getMoveDuration(player) / 1000);
  }

  private getStableBotDirection(
    player: PlayerState,
    desiredDirection: Direction | null,
    deltaMs: number,
  ): Direction | null {
    if (!this.botCommittedDirection[player.id] && player.lastMoveDirection) {
      this.botCommittedDirection[player.id] = player.lastMoveDirection;
    }

    if (!desiredDirection) {
      this.clearBotReversePending(player.id);
      return null;
    }

    const committedDirection = this.botCommittedDirection[player.id] ?? player.lastMoveDirection ?? player.direction;
    if (
      !committedDirection
      || committedDirection === desiredDirection
    ) {
      this.clearBotReversePending(player.id);
      this.rememberBotDirection(player.id, desiredDirection);
      return desiredDirection;
    }

    const currentTile = this.getTileFromPosition(player.position);
    const currentDangerMs = this.getDangerMap().get(tileKey(currentTile.x, currentTile.y));
    const immediateDanger = currentDangerMs !== undefined
      && currentDangerMs <= this.getMoveDuration(player) + BOT_DANGER_ARRIVAL_BUFFER_MS;
    if (immediateDanger) {
      this.clearBotReversePending(player.id);
      this.rememberBotDirection(player.id, desiredDirection);
      return desiredDirection;
    }

    const continueOption = this.evaluateMovementOption(player, committedDirection, deltaMs);
    const canContinueForward = this.canMovementOptionAdvance(player.position, continueOption);
    if (!this.areOppositeDirections(committedDirection, desiredDirection) || !canContinueForward) {
      this.clearBotReversePending(player.id);
      this.rememberBotDirection(player.id, desiredDirection);
      return desiredDirection;
    }

    if (this.botPendingReverseDirection[player.id] !== desiredDirection) {
      this.botPendingReverseDirection[player.id] = desiredDirection;
      this.botPendingReverseFrames[player.id] = 1;
      return committedDirection;
    }

    this.botPendingReverseFrames[player.id] += 1;
    if (this.botPendingReverseFrames[player.id] < BOT_DIRECTION_CONFIRM_FRAMES) {
      return committedDirection;
    }

    this.clearBotReversePending(player.id);
    this.rememberBotDirection(player.id, desiredDirection);
    return desiredDirection;
  }

  private clearBotReversePending(playerId: PlayerId): void {
    this.botPendingReverseDirection[playerId] = null;
    this.botPendingReverseFrames[playerId] = 0;
  }

  private rememberBotDirection(playerId: PlayerId, direction: Direction): void {
    if (this.botCommittedDirection[playerId] === direction) {
      return;
    }
    this.botCommittedDirection[playerId] = direction;
  }

  private normalizeTileAxis(value: number, size: number): number {
    const wrapped = value % size;
    return wrapped < 0 ? wrapped + size : wrapped;
  }

  private normalizeTile(tile: TileCoord): TileCoord {
    return {
      x: this.normalizeTileAxis(tile.x, GRID_WIDTH),
      y: this.normalizeTileAxis(tile.y, GRID_HEIGHT),
    };
  }

  private normalizeAxisPosition(value: number, span: number): number {
    const wrapped = value % span;
    return wrapped < 0 ? wrapped + span : wrapped;
  }

  private normalizeArenaPosition(position: PixelCoord): PixelCoord {
    return {
      x: this.normalizeAxisPosition(position.x, ARENA_PIXEL_WIDTH),
      y: this.normalizeAxisPosition(position.y, ARENA_PIXEL_HEIGHT),
    };
  }

  private getWrappedDelta(current: number, previous: number, span: number): number {
    let delta = current - previous;
    if (delta > span * 0.5) {
      delta -= span;
    } else if (delta < -span * 0.5) {
      delta += span;
    }
    return delta;
  }

  private positionChanged(from: PixelCoord, to: PixelCoord): boolean {
    return (
      Math.abs(this.getWrappedDelta(to.x, from.x, ARENA_PIXEL_WIDTH)) > 0.01
      || Math.abs(this.getWrappedDelta(to.y, from.y, ARENA_PIXEL_HEIGHT)) > 0.01
    );
  }

  private canMovementOptionAdvance(from: PixelCoord, option: MovementOption): boolean {
    return (
      (option.combinedFree && this.positionChanged(from, option.combinedMove))
      || (option.laneOnlyFree && this.positionChanged(from, option.laneOnlyMove))
      || (option.forwardOnlyFree && this.positionChanged(from, option.forwardOnlyMove))
    );
  }

  private resolveMovementDirection(player: PlayerState, desiredDirection: Direction, deltaMs: number): Direction {
    const desiredOption = this.evaluateMovementOption(player, desiredDirection, deltaMs);
    const desiredCanMove = this.canMovementOptionAdvance(player.position, desiredOption);

    const lastDirection = player.lastMoveDirection;
    if (!lastDirection || lastDirection === desiredDirection || !this.arePerpendicular(lastDirection, desiredDirection)) {
      return desiredDirection;
    }

    if (desiredCanMove) {
      return desiredDirection;
    }

    const continueOption = this.evaluateMovementOption(player, lastDirection, deltaMs);
    const continueAdvances = this.canMovementOptionAdvance(player.position, continueOption);

    return continueAdvances ? lastDirection : desiredDirection;
  }

  private evaluateMovementOption(player: PlayerState, direction: Direction, deltaMs: number): MovementOption {
    const delta = directionDelta[direction];
    const step = this.getMoveSpeed(player) * (deltaMs / 1000);
    const horizontal = delta.x !== 0;
    const laneTarget = horizontal
      ? this.getNearestLaneCenter(player.position.y)
      : this.getNearestLaneCenter(player.position.x);
    const laneDistance = horizontal
      ? Math.abs(laneTarget - player.position.y)
      : Math.abs(laneTarget - player.position.x);

    let nextX = player.position.x;
    let nextY = player.position.y;
    const canAdvanceForward = laneDistance <= LANE_LOCK_THRESHOLD;

    if (horizontal) {
      if (laneDistance <= LANE_SNAP_THRESHOLD) {
        nextY = this.approach(player.position.y, laneTarget, step * LANE_SNAP_FACTOR);
      }
      if (canAdvanceForward) {
        nextX += delta.x * step;
      }
    } else {
      if (laneDistance <= LANE_SNAP_THRESHOLD) {
        nextX = this.approach(player.position.x, laneTarget, step * LANE_SNAP_FACTOR);
      }
      if (canAdvanceForward) {
        nextY += delta.y * step;
      }
    }

    const combinedMove = this.normalizeArenaPosition({ x: nextX, y: nextY });
    const laneOnlyMove = this.normalizeArenaPosition(horizontal
      ? { x: player.position.x, y: nextY }
      : { x: nextX, y: player.position.y });
    const forwardOnlyMove = this.normalizeArenaPosition(horizontal
      ? { x: nextX, y: player.position.y }
      : { x: player.position.x, y: nextY });

    return {
      direction,
      horizontal,
      laneTarget,
      canAdvanceForward,
      combinedMove,
      laneOnlyMove,
      forwardOnlyMove,
      combinedFree: this.canOccupyPosition(player, combinedMove),
      laneOnlyFree: this.canOccupyPosition(player, laneOnlyMove),
      forwardOnlyFree: this.canOccupyPosition(player, forwardOnlyMove),
    };
  }

  private movePlayer(player: PlayerState, direction: Direction, deltaMs: number): void {
    this.movePlayerInternal(player, direction, deltaMs, true);
  }

  private movePlayerSimulated(player: PlayerState, direction: Direction, deltaMs: number): void {
    this.movePlayerInternal(player, direction, deltaMs, false);
  }

  private movePlayerInternal(player: PlayerState, direction: Direction, deltaMs: number, allowBombPush: boolean): void {
    const start = { ...player.position };
    let option = this.evaluateMovementOption(player, direction, deltaMs);

    if (allowBombPush && !option.combinedFree && !option.forwardOnlyFree && option.canAdvanceForward) {
      const pushed = this.tryPushBomb(player, direction);
      if (pushed) {
        option = this.evaluateMovementOption(player, direction, deltaMs);
      }
    }

    if (option.combinedFree && this.positionChanged(start, option.combinedMove)) {
      player.position = this.normalizeArenaPosition(option.combinedMove);
      player.velocity = {
        x: this.getWrappedDelta(player.position.x, start.x, ARENA_PIXEL_WIDTH) / (deltaMs / 1000),
        y: this.getWrappedDelta(player.position.y, start.y, ARENA_PIXEL_HEIGHT) / (deltaMs / 1000),
      };
      if (
        Math.abs(player.position.x - start.x) > 0.01 ||
        Math.abs(player.position.y - start.y) > 0.01
      ) {
        player.lastMoveDirection = direction;
      }
      return;
    }

    let moved = false;
    if (option.laneOnlyFree && this.positionChanged(start, option.laneOnlyMove)) {
      player.position = this.normalizeArenaPosition(option.laneOnlyMove);
      moved = true;
    }
    if (option.forwardOnlyFree && !moved && this.positionChanged(start, option.forwardOnlyMove)) {
      player.position = this.normalizeArenaPosition(option.forwardOnlyMove);
      moved = true;
    }

    player.velocity = moved
      ? {
          x: this.getWrappedDelta(player.position.x, start.x, ARENA_PIXEL_WIDTH) / (deltaMs / 1000),
          y: this.getWrappedDelta(player.position.y, start.y, ARENA_PIXEL_HEIGHT) / (deltaMs / 1000),
        }
      : { x: 0, y: 0 };

    if (moved && (player.velocity.x !== 0 || player.velocity.y !== 0)) {
      player.lastMoveDirection = direction;
    }

    if (option.horizontal && Math.abs(player.position.y - option.laneTarget) <= LANE_SETTLE_EPSILON) {
      player.position.y = option.laneTarget;
    }
    if (!option.horizontal && Math.abs(player.position.x - option.laneTarget) <= LANE_SETTLE_EPSILON) {
      player.position.x = option.laneTarget;
    }
    player.position = this.normalizeArenaPosition(player.position);
  }

  private arePerpendicular(a: Direction, b: Direction): boolean {
    const aHorizontal = a === "left" || a === "right";
    const bHorizontal = b === "left" || b === "right";
    return aHorizontal !== bHorizontal;
  }

  private areOppositeDirections(a: Direction, b: Direction): boolean {
    return (
      (a === "up" && b === "down")
      || (a === "down" && b === "up")
      || (a === "left" && b === "right")
      || (a === "right" && b === "left")
    );
  }

  private tryPushBomb(player: PlayerState, direction: Direction): boolean {
    if (player.kickLevel <= 0) {
      return false;
    }
    const fromTile = this.getTileFromPosition(player.position);
    const delta = directionDelta[direction];
    const bombTile = this.normalizeTile({ x: fromTile.x + delta.x, y: fromTile.y + delta.y });
    return this.tryPushBombAtTile(bombTile, direction, 1);
  }

  private findBombAtTile(tile: TileCoord): BombState | null {
    const normalized = this.normalizeTile(tile);
    const key = tileKey(normalized.x, normalized.y);
    return this.bombs.find((bomb) => tileKey(bomb.tile.x, bomb.tile.y) === key) ?? null;
  }

  private tryPushBombAtTile(tile: TileCoord, direction: Direction, distance: number): boolean {
    const bomb = this.findBombAtTile(tile);
    if (!bomb) {
      return false;
    }
    const delta = directionDelta[direction];
    let targetTile = { ...bomb.tile };
    for (let step = 0; step < distance; step += 1) {
      const nextTile = this.normalizeTile({ x: targetTile.x + delta.x, y: targetTile.y + delta.y });
      const targetKey = tileKey(nextTile.x, nextTile.y);
      if (this.arena.solid.has(targetKey) || this.arena.breakable.has(targetKey)) {
        return false;
      }
      if (this.bombs.some((item) => item.id !== bomb.id && item.tile.x === nextTile.x && item.tile.y === nextTile.y)) {
        return false;
      }
      if (this.hasPlayerOnTile(nextTile)) {
        return false;
      }
      targetTile = nextTile;
    }
    bomb.tile = this.normalizeTile(targetTile);
    bomb.ownerCanPass = false;
    return true;
  }

  private hasPlayerOnTile(tile: TileCoord): boolean {
    const normalizedTile = this.normalizeTile(tile);
    for (const id of this.activePlayerIds) {
      const player = this.players[id];
      if (!player.alive) {
        continue;
      }
      const playerTile = this.getTileFromPosition(player.position);
      if (playerTile.x === normalizedTile.x && playerTile.y === normalizedTile.y) {
        return true;
      }
    }
    return false;
  }

  private canOccupyPosition(player: PlayerState, position: PixelCoord): boolean {
    const wrapped = this.normalizeArenaPosition(position);
    const left = wrapped.x - PLAYER_HITBOX_HALF;
    const right = wrapped.x + PLAYER_HITBOX_HALF;
    const top = wrapped.y - PLAYER_HITBOX_HALF;
    const bottom = wrapped.y + PLAYER_HITBOX_HALF;

    const minTileX = Math.floor(left / TILE_SIZE);
    const maxTileX = Math.floor((right - 0.001) / TILE_SIZE);
    const minTileY = Math.floor(top / TILE_SIZE);
    const maxTileY = Math.floor((bottom - 0.001) / TILE_SIZE);

    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        if (this.isTileBlockedForPlayer(player, tileX, tileY)) {
          return false;
        }
      }
    }

    return true;
  }

  private isTileBlockedForPlayer(player: PlayerState, tileX: number, tileY: number): boolean {
    const normalized = this.normalizeTile({ x: tileX, y: tileY });
    const key = tileKey(normalized.x, normalized.y);
    if (this.arena.solid.has(key) || this.arena.breakable.has(key)) {
      return true;
    }

    for (const bomb of this.bombs) {
      if (bomb.tile.x !== normalized.x || bomb.tile.y !== normalized.y) {
        continue;
      }
      if (player.bombPassLevel > 0) {
        continue;
      }
      if (bomb.ownerId === player.id && bomb.ownerCanPass) {
        continue;
      }
      return true;
    }

    return false;
  }

  private getTileCenter(tile: TileCoord): PixelCoord {
    const normalized = this.normalizeTile(tile);
    return {
      x: normalized.x * TILE_SIZE + TILE_SIZE * 0.5,
      y: normalized.y * TILE_SIZE + TILE_SIZE * 0.5,
    };
  }

  private getTileFromPosition(position: PixelCoord): TileCoord {
    const wrapped = this.normalizeArenaPosition(position);
    return {
      x: this.normalizeTileAxis(Math.floor(wrapped.x / TILE_SIZE), GRID_WIDTH),
      y: this.normalizeTileAxis(Math.floor(wrapped.y / TILE_SIZE), GRID_HEIGHT),
    };
  }

  private getNearestLaneCenter(value: number): number {
    const half = TILE_SIZE * 0.5;
    const lane = Math.round((value - half) / TILE_SIZE);
    return lane * TILE_SIZE + half;
  }

  private approach(current: number, target: number, amount: number): number {
    if (current < target) {
      return Math.min(target, current + amount);
    }
    if (current > target) {
      return Math.max(target, current - amount);
    }
    return current;
  }

  private isPlayerOverlappingTile(player: PlayerState, tile: TileCoord): boolean {
    const left = player.position.x - PLAYER_HITBOX_HALF;
    const right = player.position.x + PLAYER_HITBOX_HALF;
    const top = player.position.y - PLAYER_HITBOX_HALF;
    const bottom = player.position.y + PLAYER_HITBOX_HALF;
    const tileLeft = tile.x * TILE_SIZE;
    const tileRight = tileLeft + TILE_SIZE;
    const tileTop = tile.y * TILE_SIZE;
    const tileBottom = tileTop + TILE_SIZE;

    return left < tileRight && right > tileLeft && top < tileBottom && bottom > tileTop;
  }

  private placeBomb(player: PlayerState): boolean {
    if (!player.alive || player.activeBombs >= player.maxBombs) {
      return false;
    }
    const tile = this.getTileFromPosition(player.position);
    player.tile = tile;
    const key = tileKey(tile.x, tile.y);
    if (this.bombs.some((bomb) => tileKey(bomb.tile.x, bomb.tile.y) === key)) {
      return false;
    }

    this.bombs.push({
      id: this.nextBombId,
      ownerId: player.id,
      tile: { ...tile },
      fuseMs: BOMB_FUSE_MS,
      ownerCanPass: true,
      flameRange: player.flameRange,
    });
    this.nextBombId += 1;
    player.activeBombs += 1;
    this.soundManager.playOneShot("bombPlace");
    return true;
  }

  private triggerRemoteDetonation(player: PlayerState): void {
    if (!player.alive || player.remoteLevel <= 0) {
      return;
    }
    const selectedBomb = this.getOldestOwnedBomb(player.id);
    if (selectedBomb) {
      selectedBomb.fuseMs = 0;
    }
  }

  private updateBombs(deltaMs: number): void {
    for (const bomb of this.bombs) {
      if (bomb.ownerCanPass) {
        const owner = this.players[bomb.ownerId];
        if (!this.isPlayerOverlappingTile(owner, bomb.tile)) {
          bomb.ownerCanPass = false;
        }
      }
      bomb.fuseMs -= deltaMs;
    }

    const queue = this.bombs.filter((bomb) => bomb.fuseMs <= 0).map((bomb) => bomb.id);
    const exploded = new Set<number>();
    while (queue.length > 0) {
      const bombId = queue.shift();
      if (bombId === undefined || exploded.has(bombId)) {
        continue;
      }
      exploded.add(bombId);
      this.explodeBomb(bombId, queue);
    }
  }

  private explodeBomb(bombId: number, queue: number[]): void {
    const index = this.bombs.findIndex((item) => item.id === bombId);
    if (index === -1) {
      return;
    }

    const [bomb] = this.bombs.splice(index, 1);
    this.players[bomb.ownerId].activeBombs = Math.max(0, this.players[bomb.ownerId].activeBombs - 1);
    this.soundManager.playOneShot("bombExplode");
    const flameTiles = new Set<string>();
    let brokeCrate = false;
    const range = bomb.flameRange;
    flameTiles.add(tileKey(bomb.tile.x, bomb.tile.y));

    for (const direction of Object.values(directionDelta)) {
      for (let step = 1; step <= range; step += 1) {
        const x = bomb.tile.x + direction.x * step;
        const y = bomb.tile.y + direction.y * step;
        if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) {
          break;
        }
        const key = tileKey(x, y);
        if (this.arena.solid.has(key)) {
          break;
        }

        flameTiles.add(key);

        const chainedBomb = this.bombs.find((item) => item.tile.x === x && item.tile.y === y);
        if (chainedBomb) {
          chainedBomb.fuseMs = 0;
          queue.push(chainedBomb.id);
        }

        if (this.arena.breakable.has(key)) {
          this.arena.breakable.delete(key);
          this.revealPowerUpAt(key);
          brokeCrate = true;
          break;
        }
      }
    }

    flameTiles.forEach((key) => {
      const [xText, yText] = key.split(",");
      this.addFlame({ x: Number(xText), y: Number(yText) });
    });
    this.soundManager.playOneShot("flameIgnite");
    if (brokeCrate) {
      this.soundManager.playOneShot("crateBreak");
    }
    this.resolvePlayerDeathsFromFlames();
  }

  private revealPowerUpAt(key: string): void {
    const item = this.arena.powerUps.find((powerUp) => tileKey(powerUp.tile.x, powerUp.tile.y) === key);
    if (item) {
      item.revealed = true;
    }
  }

  private addFlame(tile: TileCoord, durationMs: number = FLAME_DURATION_MS): void {
    const existing = this.flames.find((flame) => flame.tile.x === tile.x && flame.tile.y === tile.y);
    if (existing) {
      existing.remainingMs = Math.max(existing.remainingMs, durationMs);
      return;
    }
    this.flames.push({ tile: { ...tile }, remainingMs: durationMs });
  }

  private updateSuddenDeath(deltaMs: number): void {
    if (!this.suddenDeathActive && this.roundTimeMs <= SUDDEN_DEATH_START_MS) {
      this.suddenDeathActive = true;
      this.suddenDeathTickMs = 0;
      this.soundManager.playOneShot("suddenDeath");
    }

    if (!this.suddenDeathActive || this.suddenDeathPath.length === 0 || this.suddenDeathIndex >= this.suddenDeathPath.length) {
      return;
    }

    this.suddenDeathTickMs -= deltaMs;
    while (this.suddenDeathTickMs <= 0 && this.suddenDeathIndex < this.suddenDeathPath.length) {
      const headTile = this.suddenDeathPath[this.suddenDeathIndex];
      const tailTile = this.suddenDeathPath[this.suddenDeathPath.length - 1 - this.suddenDeathIndex];
      this.triggerSuddenDeathFlame(headTile);
      if (headTile.x !== tailTile.x || headTile.y !== tailTile.y) {
        this.triggerSuddenDeathFlame(tailTile);
      }
      this.suddenDeathIndex += 1;
      this.suddenDeathTickMs += SUDDEN_DEATH_TICK_MS;
    }
  }

  private triggerSuddenDeathFlame(tile: TileCoord): void {
    const key = tileKey(tile.x, tile.y);
    if (this.arena.solid.has(key)) {
      return;
    }
    if (this.arena.breakable.has(key)) {
      this.arena.breakable.delete(key);
      this.revealPowerUpAt(key);
      this.soundManager.playOneShot("crateBreak", 0.92);
    }
    const bomb = this.bombs.find((item) => item.tile.x === tile.x && item.tile.y === tile.y);
    if (bomb) {
      bomb.fuseMs = 0;
    }
    this.addFlame(tile, SUDDEN_DEATH_FLAME_MS);
    this.resolvePlayerDeathsFromFlames();
  }

  private buildSuddenDeathPath(): TileCoord[] {
    const spiral: TileCoord[] = [];
    let left = 0;
    let right = GRID_WIDTH - 1;
    let top = 0;
    let bottom = GRID_HEIGHT - 1;

    while (left <= right && top <= bottom) {
      for (let x = left; x <= right; x += 1) {
        spiral.push({ x, y: top });
      }
      for (let y = top + 1; y <= bottom; y += 1) {
        spiral.push({ x: right, y });
      }
      if (bottom > top) {
        for (let x = right - 1; x >= left; x -= 1) {
          spiral.push({ x, y: bottom });
        }
      }
      if (right > left) {
        for (let y = bottom - 1; y > top; y -= 1) {
          spiral.push({ x: left, y });
        }
      }
      left += 1;
      right -= 1;
      top += 1;
      bottom -= 1;
    }

    return spiral.filter((tile) => !this.arena.solid.has(tileKey(tile.x, tile.y)));
  }

  private updateFlames(deltaMs: number): void {
    for (const flame of this.flames) {
      flame.remainingMs -= deltaMs;
    }
    this.flames = this.flames.filter((flame) => flame.remainingMs > 0);
    this.resolvePlayerDeathsFromFlames();
  }

  private resolvePlayerDeathsFromFlames(): void {
    const flameKeys = new Set(this.flames.map((flame) => tileKey(flame.tile.x, flame.tile.y)));
    for (const id of this.activePlayerIds) {
      const player = this.players[id];
      if (!player.alive) {
        continue;
      }
      player.tile = this.getTileFromPosition(player.position);
      if (flameKeys.has(tileKey(player.tile.x, player.tile.y))) {
        if (player.spawnProtectionMs > 0) {
          continue;
        }
        if (this.isPlayerImmuneDuringSkillChannel(player)) {
          continue;
        }
        if (player.flameGuardMs > 0) {
          continue;
        }
        if (player.shieldCharges > 0) {
          player.shieldCharges -= 1;
          player.flameGuardMs = SHIELD_GUARD_MS;
          this.soundManager.playOneShot("shieldBlock");
          continue;
        }
        player.alive = false;
        player.velocity = { x: 0, y: 0 };
        player.skill = createDefaultPlayerSkillState(player.skill.id);
        this.soundManager.playOneShot("playerDeath");
      }
    }
  }

  private collectPowerUps(): void {
    for (const id of this.activePlayerIds) {
      const player = this.players[id];
      if (!player.alive) {
        continue;
      }
      const tile = this.getTileFromPosition(player.position);
      player.tile = tile;

      for (const powerUp of this.arena.powerUps) {
        if (!powerUp.revealed || powerUp.collected) {
          continue;
        }
        if (powerUp.tile.x === tile.x && powerUp.tile.y === tile.y) {
          powerUp.collected = true;
          applyPowerUpToPlayer(player, powerUp.type);
          this.soundManager.playOneShot("powerupCollect");
        }
      }
    }
  }

  private evaluateRoundState(): void {
    const alivePlayers = this.activePlayerIds.filter((id) => this.players[id].alive);
    if (alivePlayers.length > 1) {
      return;
    }
    if (alivePlayers.length === 0) {
      this.finishRound(null, "double-ko", "Double KO. Nobody scores.");
      return;
    }
    this.finishRound(alivePlayers[0], "elimination", `${this.players[alivePlayers[0]].name} wins the round.`);
  }

  private finishRound(winner: PlayerId | null, reason: RoundOutcome["reason"], message: string): void {
    if (this.roundOutcome) {
      return;
    }
    const clinchesMatch = winner ? this.score[winner] + 1 >= TARGET_WINS : false;
    if (reason === "elimination" || winner) {
      this.soundManager.playOneShot(clinchesMatch ? "matchWin" : "roundWin");
    }
    if (winner) {
      this.score[winner] += 1;
    }
    this.roundOutcome = {
      winner,
      reason,
      message,
      countdownMs: ROUND_END_DELAY_MS,
    };
  }

  private advanceAfterRound(): void {
    for (const playerId of this.activePlayerIds) {
      if (this.score[playerId] >= TARGET_WINS) {
        this.matchWinner = playerId;
        this.matchResultChoice = createPlayerRecord(() => null);
        this.input.clearPresses();
        this.mode = "match-result";
        return;
      }
    }
    this.input.clearPresses();
    this.roundNumber += 1;
    this.resetRound();
  }

  private getPlayerPixelPositionFromState(player: PlayerState): PixelCoord {
    return {
      x: ARENA_OFFSET_X + player.position.x - TILE_SIZE * 0.5,
      y: ARENA_OFFSET_Y + player.position.y - TILE_SIZE * 0.5,
    };
  }

  private getPlayerPixelPosition(player: PlayerState): PixelCoord {
    if (this.headless) {
      return this.getPlayerPixelPositionFromState(player);
    }
    return this.visualPlayerPositions[player.id] ?? this.getPlayerPixelPositionFromState(player);
  }

  private render(): void {
    this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.renderBackdrop();

    if (this.mode === "menu") {
      this.renderMenu();
      return;
    }

    this.renderArena();
    this.renderHud();

    if (this.mode === "match") {
      this.renderMatchOverlay();
      if (this.isAnyCharacterMenuOpen()) {
        this.renderCharacterSelectionOverlay();
      }
      return;
    }

    this.renderMatchResult();
    if (this.isAnyCharacterMenuOpen()) {
      this.renderCharacterSelectionOverlay();
    }
  }

  private renderBackdrop(): void {
    const arenaWidth = GRID_WIDTH * TILE_SIZE;
    const arenaHeight = GRID_HEIGHT * TILE_SIZE;
    const arenaX = ARENA_OFFSET_X;
    const arenaY = ARENA_OFFSET_Y;
    const arenaRight = arenaX + arenaWidth;
    const arenaBottom = arenaY + arenaHeight;
    const frameX = arenaX - 10;
    const frameY = arenaY - 10;
    const frameWidth = arenaWidth + 20;
    const frameHeight = arenaHeight + 20;

    const gradient = this.ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, "#2b466f");
    gradient.addColorStop(0.38, "#122540");
    gradient.addColorStop(1, "#050913");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const mist = this.ctx.createRadialGradient(CANVAS_WIDTH - 92, 84, 18, CANVAS_WIDTH - 92, 84, 214);
    mist.addColorStop(0, "rgba(198, 223, 255, 0.18)");
    mist.addColorStop(0.4, "rgba(128, 168, 214, 0.12)");
    mist.addColorStop(1, "rgba(9, 20, 39, 0)");
    this.ctx.fillStyle = mist;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const floorGlow = this.ctx.createLinearGradient(0, arenaBottom - 24, 0, CANVAS_HEIGHT);
    floorGlow.addColorStop(0, "rgba(31, 48, 72, 0)");
    floorGlow.addColorStop(1, "rgba(6, 12, 22, 0.9)");
    this.ctx.fillStyle = floorGlow;
    this.ctx.fillRect(0, arenaBottom - 24, CANVAS_WIDTH, CANVAS_HEIGHT - arenaBottom + 24);

    this.ctx.fillStyle = "rgba(15, 26, 45, 0.72)";
    this.ctx.beginPath();
    this.ctx.moveTo(0, arenaY - 10);
    this.ctx.lineTo(arenaX - 2, arenaY + 44);
    this.ctx.lineTo(arenaX - 10, arenaBottom + 42);
    this.ctx.lineTo(0, CANVAS_HEIGHT);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.moveTo(CANVAS_WIDTH, arenaY - 2);
    this.ctx.lineTo(arenaRight + 2, arenaY + 58);
    this.ctx.lineTo(arenaRight + 12, arenaBottom + 40);
    this.ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = "rgba(7, 11, 20, 0.46)";
    this.ctx.fillRect(frameX + 4, frameY + 14, frameWidth - 8, frameHeight - 4);

    this.ctx.fillStyle = "rgba(129, 156, 194, 0.2)";
    this.ctx.beginPath();
    this.ctx.moveTo(frameX, frameY + 4);
    this.ctx.lineTo(frameX + frameWidth, frameY + 4);
    this.ctx.lineTo(frameX + frameWidth - 6, frameY + 18);
    this.ctx.lineTo(frameX + 6, frameY + 18);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.strokeStyle = "rgba(171, 214, 255, 0.18)";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(frameX + 0.5, frameY + 0.5, frameWidth - 1, frameHeight - 1);

    this.ctx.fillStyle = "rgba(176, 208, 248, 0.06)";
    this.ctx.beginPath();
    this.ctx.ellipse(CANVAS_WIDTH - 84, arenaBottom + 16, 104, 76, -0.35, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = "rgba(9, 16, 28, 0.34)";
    this.ctx.beginPath();
    this.ctx.moveTo(24, arenaY + 54);
    this.ctx.lineTo(56, arenaY + 120);
    this.ctx.lineTo(42, arenaBottom - 30);
    this.ctx.lineTo(14, arenaBottom - 40);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.strokeStyle = "rgba(174, 206, 235, 0.09)";
    this.ctx.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      this.ctx.beginPath();
      this.ctx.moveTo(12 + i * 8, arenaY + 84 + i * 18);
      this.ctx.lineTo(34 + i * 8, arenaY + 56 + i * 16);
      this.ctx.stroke();
    }

    const vignette = this.ctx.createRadialGradient(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      120,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      360,
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.34)");
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  private renderMenu(): void {
    this.renderArena();
    this.renderHud();

    this.ctx.fillStyle = "rgba(4, 10, 18, 0.7)";
    this.ctx.fillRect(12, HUD_HEIGHT + 10, 456, 48);
    this.ctx.strokeStyle = "rgba(143, 205, 247, 0.32)";
    this.ctx.strokeRect(12.5, HUD_HEIGHT + 10.5, 455, 47);
    this.ctx.textAlign = "left";
    this.ctx.font = "bold 9px monospace";
    this.ctx.fillStyle = "#e2f2ff";
    this.ctx.fillText("MENU LOCAL  |  E/P READY  |  G/K CHARACTER", 22, HUD_HEIGHT + 27);
    this.ctx.font = "8px monospace";
    this.ctx.fillStyle = "#bbd7ee";
    this.ctx.fillText(
      `B toggle bot rapido  |  N cicla bots: ${this.localBotFill}  |  ativos: ${this.activePlayerIds.length}`,
      22,
      HUD_HEIGHT + 43,
    );

    if (this.isAnyCharacterMenuOpen()) {
      this.renderCharacterSelectionOverlay();
    }
  }

  private renderCharacterSelectionOverlay(): void {
    this.ctx.fillStyle = "rgba(2, 6, 12, 0.74)";
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.drawCharacterSelectionPanel(1, 28, 112);
    this.drawCharacterSelectionPanel(2, 252, 112);
  }

  private drawCharacterSelectionPanel(playerId: PlayerId, x: number, y: number): void {
    const panelWidth = 200;
    const panelHeight = 244;
    const palette = PLAYER_COLORS[playerId];
    const isOpen = this.characterMenuOpen[playerId];
    const entry = this.getPreviewCharacterEntry(playerId);
    const currentIndex = this.pendingCharacterIndex[playerId];

    this.ctx.fillStyle = "rgba(8, 14, 23, 0.94)";
    this.ctx.fillRect(x, y, panelWidth, panelHeight);
    this.ctx.strokeStyle = palette.primary;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x + 0.5, y + 0.5, panelWidth - 1, panelHeight - 1);

    this.ctx.textAlign = "left";
    this.ctx.fillStyle = palette.primary;
    this.ctx.font = "bold 13px monospace";
    this.ctx.fillText(`P${playerId} CHARACTER`, x + 10, y + 20);
    this.ctx.fillStyle = "#d9ebfb";
    this.ctx.font = "11px monospace";
    this.ctx.fillText(this.shortenCharacterName(entry.name, 24), x + 10, y + 40);
    this.ctx.fillText(`${currentIndex + 1}/${this.characterRoster.length}`, x + 10, y + 56);

    for (let row = 0; row < 5; row += 1) {
      const offset = row - 2;
      const index = (currentIndex + offset + this.characterRoster.length) % this.characterRoster.length;
      const item = this.characterRoster[index];
      const rowY = y + 76 + row * 26;
      const selected = offset === 0;
      this.ctx.fillStyle = selected ? "rgba(113, 210, 255, 0.24)" : "rgba(255, 255, 255, 0.04)";
      this.ctx.fillRect(x + 8, rowY - 14, panelWidth - 16, 22);
      this.ctx.fillStyle = selected ? "#f4fbff" : "rgba(214, 231, 247, 0.78)";
      this.ctx.font = selected ? "bold 11px monospace" : "10px monospace";
      this.ctx.fillText(this.shortenCharacterName(item.name, 26), x + 12, rowY);
    }

    this.ctx.fillStyle = "#b9d3e8";
    this.ctx.font = "10px monospace";
    this.ctx.fillText(
      playerId === 1 ? "W/S browse  E lock  G close" : "UP/DN browse  P lock  K close",
      x + 10,
      y + 222,
    );
    if (isOpen) {
      this.ctx.fillStyle = "rgba(244, 251, 255, 0.9)";
      this.ctx.fillText("Selection is live after lock.", x + 10, y + 238);
    }
  }

  private drawHudPanel(x: number, y: number, width: number, height: number, accent: string): void {
    this.ctx.fillStyle = "rgba(8, 15, 25, 0.72)";
    this.ctx.fillRect(x, y, width, height);
    this.ctx.fillStyle = accent;
    this.ctx.fillRect(x, y, width, 3);
    this.ctx.strokeStyle = "rgba(168, 213, 255, 0.18)";
    this.ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  }

  private renderHud(): void {
    const hudGradient = this.ctx.createLinearGradient(0, 0, CANVAS_WIDTH, HUD_HEIGHT);
    hudGradient.addColorStop(0, "rgba(17, 28, 46, 0.96)");
    hudGradient.addColorStop(0.5, "rgba(22, 38, 61, 0.96)");
    hudGradient.addColorStop(1, "rgba(19, 31, 50, 0.96)");
    this.ctx.fillStyle = hudGradient;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_HEIGHT);
    this.ctx.fillStyle = "rgba(158, 214, 255, 0.18)";
    this.ctx.fillRect(0, HUD_HEIGHT - 2, CANVAS_WIDTH, 2);

    const playerCount = Math.max(1, this.activePlayerIds.length);
    const twoPlayerLayout = playerCount === 2;
    const hudPanelY = 20;

    if (twoPlayerLayout) {
      const panelWidth = 168;
      const leftPlayerId = this.activePlayerIds[0];
      const rightPlayerId = this.activePlayerIds[1];
      if (leftPlayerId !== undefined) {
        this.renderPlayerHud(leftPlayerId, 8, hudPanelY, panelWidth);
      }
      if (rightPlayerId !== undefined) {
        this.renderPlayerHud(rightPlayerId, CANVAS_WIDTH - panelWidth - 8, hudPanelY, panelWidth);
      }
    } else {
      const slotWidth = (CANVAS_WIDTH - 10) / playerCount;
      this.activePlayerIds.forEach((playerId, index) => {
        this.renderPlayerHud(playerId, 5 + index * slotWidth, hudPanelY, slotWidth - 5);
      });
    }

    this.ctx.textAlign = "left";
    this.ctx.font = "bold 8px monospace";
    this.drawHudText(`R${this.roundNumber}`, 12, 14, "#d8eaf8", "rgba(4, 10, 19, 0.9)");
    this.drawHudText(`GOAL ${TARGET_WINS}`, 12, 27, "#d8eaf8", "rgba(4, 10, 19, 0.9)");
    this.drawHudText(
      this.showDangerOverlay ? "DANGER ON" : "DANGER OFF",
      12,
      HUD_HEIGHT - 9,
      this.showDangerOverlay ? "rgba(255, 213, 163, 0.96)" : "rgba(176, 197, 218, 0.82)",
      "rgba(4, 10, 19, 0.9)",
    );

    this.ctx.textAlign = "center";
    this.ctx.font = "bold 8px monospace";
    this.drawHudText("TIME", CANVAS_WIDTH / 2, 14, "#b8cde2", "rgba(4, 10, 19, 0.9)");
    this.ctx.font = "bold 16px monospace";
    this.drawHudText(
      Math.ceil(this.roundTimeMs / 1000).toString().padStart(2, "0"),
      CANVAS_WIDTH / 2,
      30,
      "#f7fbff",
      "rgba(4, 10, 19, 0.9)",
    );
    this.ctx.font = "7px monospace";
    this.drawHudText(
      this.showBombPreview ? "BLAST ON" : "BLAST OFF",
      CANVAS_WIDTH / 2,
      HUD_HEIGHT - 9,
      this.showBombPreview ? "rgba(183, 247, 232, 0.96)" : "rgba(176, 197, 218, 0.82)",
      "rgba(4, 10, 19, 0.9)",
    );

    if (!this.roundOutcome) {
      this.ctx.textAlign = "center";
      this.ctx.font = "bold 8px monospace";
      if (this.suddenDeathActive) {
        this.drawHudText("SUDDEN DEATH", 240, HUD_HEIGHT - 22, "#ffb58f", "rgba(4, 10, 19, 0.9)");
      } else {
        const untilSuddenDeath = Math.max(0, this.roundTimeMs - SUDDEN_DEATH_START_MS);
        this.drawHudText(
          `SD ${Math.ceil(untilSuddenDeath / 1000)}s`,
          240,
          HUD_HEIGHT - 22,
          "rgba(203, 222, 238, 0.82)",
          "rgba(4, 10, 19, 0.9)",
        );
      }
    }
  }

  private renderPlayerHud(playerId: PlayerId, x: number, y: number, width: number): void {
    const player = this.players[playerId];
    const palette = PLAYER_COLORS[playerId];
    const title = `${this.getPlayerSlotLabel(playerId)} ${this.score[playerId]}`;
    const statLine = `B${player.maxBombs} F${player.flameRange} S${player.speedLevel}`;
    const status = !player.alive
      ? "DOWN"
      : player.skill.phase === "channeling"
        ? "ICE"
        : player.flameGuardMs > 0
          ? "GUARD"
          : "LIVE";
    const skillSlots = this.getHudSkillSlots(playerId);

    this.drawHudPanel(x, y, width, 36, palette.glow);
    this.ctx.textAlign = "left";
    this.ctx.font = "bold 8px monospace";
    this.drawHudText(title, x + 6, y + 10, palette.primary, "rgba(4, 10, 19, 0.9)");
    this.ctx.font = "6px monospace";
    this.drawHudText(
      this.shortenCharacterName(this.getCharacterLabel(playerId, 12), 12),
      x + 6,
      y + 18,
      "#dbefff",
      "rgba(4, 10, 19, 0.9)",
    );
    this.ctx.textAlign = "right";
    this.drawHudText(status, x + width - 6, y + 10, player.alive ? "#e5fff7" : "rgba(210, 220, 231, 0.55)", "rgba(4, 10, 19, 0.85)");
    this.drawHudText(statLine, x + width - 6, y + 18, "#dbefff", "rgba(4, 10, 19, 0.85)");

    const insetX = x + 4;
    const insetY = y + 22;
    const insetWidth = Math.max(12, width - 8);
    const gap = 2;
    const slotCount = skillSlots.length;
    const slotWidth = Math.max(10, Math.floor((insetWidth - gap * (slotCount - 1)) / slotCount));
    for (let index = 0; index < slotCount; index += 1) {
      const slot = skillSlots[index];
      const slotX = insetX + index * (slotWidth + gap);
      this.drawHudSkillSlot(slotX, insetY, slotWidth, 10, slot);
    }
  }

  private getHudSkillSlots(playerId: PlayerId): HudSkillSlot[] {
    const player = this.players[playerId];
    const detonateKeyLabel = this.getDetonateHudKeyLabel(playerId);

    return SKILL_POWER_UP_TYPES.map((type) => {
      const level = getPowerUpLevel(player, type);
      let valueLabel = "--";
      if (type === "shield-up") {
        valueLabel = `x${level}`;
      } else if (type === "remote-up") {
        if (level > 0) {
          valueLabel = "ON";
        } else {
          valueLabel = "--";
        }
      } else {
        valueLabel = level > 0 ? "ON" : "--";
      }

      return {
        type,
        level,
        acquired: level > 0,
        keyLabel: type === "remote-up" && level > 0 ? detonateKeyLabel : null,
        valueLabel,
      } satisfies HudSkillSlot;
    });
  }

  private getDetonateHudKeyLabel(playerId: PlayerId): string | null {
    if (this.onlineSession) {
      if (playerId !== this.onlineLocalPlayerId) {
        return null;
      }
      return formatControlKey(KEY_BINDINGS[1].detonate);
    }
    if (MENU_PLAYER_IDS.includes(playerId as MenuPlayerId)) {
      return formatControlKey(KEY_BINDINGS[playerId as MenuPlayerId].detonate);
    }
    return null;
  }

  private drawHudSkillSlot(x: number, y: number, width: number, height: number, slot: HudSkillSlot): void {
    const definition = getPowerUpDefinition(slot.type);
    const tint = slot.acquired ? definition.tint : "rgba(173, 196, 217, 0.35)";
    this.ctx.fillStyle = slot.acquired ? "rgba(7, 18, 31, 0.88)" : "rgba(7, 15, 26, 0.62)";
    this.ctx.fillRect(x, y, width, height);
    this.ctx.strokeStyle = slot.acquired ? tint : "rgba(156, 190, 220, 0.2)";
    this.ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, width - 1), Math.max(1, height - 1));

    const icon = this.assets.powerUps[slot.type];
    if (icon) {
      this.ctx.globalAlpha = slot.acquired ? 1 : 0.4;
      this.ctx.drawImage(icon, x + 1, y + 1, 8, 8);
      this.ctx.globalAlpha = 1;
    } else {
      this.ctx.textAlign = "center";
      this.ctx.font = "bold 6px monospace";
      this.drawHudText(definition.shortLabel, x + 5, y + 7, tint, "rgba(4, 10, 19, 0.9)");
    }

    this.ctx.textAlign = "left";
    this.ctx.font = "bold 6px monospace";
    const valueColor = slot.acquired ? "#e9f7ff" : "rgba(169, 192, 214, 0.62)";
    this.drawHudText(slot.valueLabel, x + 11, y + 7, valueColor, "rgba(4, 10, 19, 0.9)");
    if (slot.keyLabel && width >= 24) {
      this.ctx.textAlign = "right";
      this.ctx.font = "6px monospace";
      this.drawHudText(slot.keyLabel, x + width - 2, y + 7, tint, "rgba(4, 10, 19, 0.9)");
    }
  }

  private renderArena(): void {
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);
    const sideColumn = Math.min(2, GRID_WIDTH - 3);
    const farSideColumn = Math.max(GRID_WIDTH - 3, sideColumn + 1);
    const sideRow = Math.min(2, GRID_HEIGHT - 3);
    const farSideRow = Math.max(GRID_HEIGHT - 3, sideRow + 1);
    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        const screenX = ARENA_OFFSET_X + x * TILE_SIZE;
        const screenY = ARENA_OFFSET_Y + y * TILE_SIZE;
        const key = tileKey(x, y);
        const isWrapPortal = isWrapPortalTile(x, y);
        const isCenterLane = x === centerX || y === centerY;
        const isSideLane = x === sideColumn || x === farSideColumn || y === sideRow || y === farSideRow;
        const isSpawnBay = (x <= 2 && y <= 2)
          || (x >= GRID_WIDTH - 3 && y <= 2)
          || (x <= 2 && y >= GRID_HEIGHT - 3)
          || (x >= GRID_WIDTH - 3 && y >= GRID_HEIGHT - 3);
        let baseTone = (x + y) % 2 === 0 ? "#10233d" : "#0b1830";
        if (isSideLane) {
          baseTone = (x + y) % 2 === 0 ? "#112946" : "#0d2140";
        }
        if (isCenterLane) {
          baseTone = (x + y) % 2 === 0 ? "#143152" : "#112947";
        }
        if (isSpawnBay) {
          baseTone = (x + y) % 2 === 0 ? "#163656" : "#13304f";
        }
        if (isWrapPortal) {
          baseTone = (x + y) % 2 === 0 ? "#1f3a52" : "#183149";
        }
        const floorSprite = isSpawnBay
          ? this.assets.floor.spawn
          : isWrapPortal || isCenterLane || isSideLane
            ? this.assets.floor.lane
            : this.assets.floor.base;
        if (floorSprite) {
          this.ctx.drawImage(floorSprite, screenX, screenY, TILE_SIZE, TILE_SIZE);
        } else {
          this.ctx.fillStyle = baseTone;
          this.ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        }
        if (!floorSprite) {
          this.ctx.strokeStyle = "rgba(146, 208, 255, 0.08)";
          this.ctx.strokeRect(screenX + 0.5, screenY + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        }

        if (!floorSprite && !this.arena.solid.has(key) && !this.arena.breakable.has(key)) {
          this.ctx.fillStyle = isCenterLane ? "rgba(110, 214, 255, 0.1)" : "rgba(255, 255, 255, 0.04)";
          this.ctx.fillRect(screenX + 8, screenY + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        }

        if (this.arena.solid.has(key)) {
          this.drawWall(screenX, screenY);
        } else if (this.arena.breakable.has(key)) {
          this.drawCrate(screenX, screenY);
        } else if (isWrapPortal) {
          this.ctx.strokeStyle = "rgba(158, 230, 255, 0.48)";
          this.ctx.strokeRect(screenX + 6.5, screenY + 6.5, TILE_SIZE - 13, TILE_SIZE - 13);
          this.ctx.fillStyle = "rgba(126, 206, 255, 0.1)";
          this.ctx.fillRect(screenX + 11, screenY + 11, TILE_SIZE - 22, TILE_SIZE - 22);
        }
      }
    }

    this.drawDangerOverlay();
    this.drawBombPreviewOverlay();

    for (const powerUp of this.arena.powerUps) {
      if (powerUp.revealed && !powerUp.collected) {
        this.drawPowerUp(powerUp);
      }
    }

    for (const bomb of this.bombs) {
      this.drawBomb(bomb);
    }

    for (const flame of this.flames) {
      this.drawFlame(flame);
    }

    for (const id of this.activePlayerIds) {
      this.drawPlayer(this.players[id]);
    }

    this.ctx.strokeStyle = "rgba(188, 223, 255, 0.16)";
    this.ctx.strokeRect(
      ARENA_OFFSET_X - 0.5,
      ARENA_OFFSET_Y - 0.5,
      GRID_WIDTH * TILE_SIZE + 1,
      GRID_HEIGHT * TILE_SIZE + 1,
    );

    this.ctx.fillStyle = "rgba(173, 204, 232, 0.04)";
    this.ctx.fillRect(ARENA_OFFSET_X, ARENA_OFFSET_Y, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);

    const arenaMist = this.ctx.createLinearGradient(0, ARENA_OFFSET_Y, 0, CANVAS_HEIGHT);
    arenaMist.addColorStop(0, "rgba(194, 220, 247, 0.05)");
    arenaMist.addColorStop(0.35, "rgba(74, 108, 153, 0)");
    arenaMist.addColorStop(1, "rgba(4, 8, 14, 0.1)");
    this.ctx.fillStyle = arenaMist;
    this.ctx.fillRect(ARENA_OFFSET_X, ARENA_OFFSET_Y, GRID_WIDTH * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);
  }

  private getDangerOverlayTiles(): Array<{ x: number; y: number; etaMs: number }> {
    const dangerMap = this.getDangerMap();
    const tiles: Array<{ x: number; y: number; etaMs: number }> = [];
    for (const [key, etaMs] of dangerMap.entries()) {
      if (etaMs > DANGER_OVERLAY_MAX_ETA_MS) {
        continue;
      }
      const [xText, yText] = key.split(",");
      const x = Number(xText);
      const y = Number(yText);
      if (Number.isNaN(x) || Number.isNaN(y)) {
        continue;
      }
      if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) {
        continue;
      }
      if (this.arena.solid.has(key)) {
        continue;
      }
      tiles.push({ x, y, etaMs: Math.max(0, Math.round(etaMs)) });
    }
    tiles.sort((a, b) => a.etaMs - b.etaMs || a.y - b.y || a.x - b.x);
    return tiles;
  }

  private drawDangerOverlay(): void {
    if (!this.showDangerOverlay) {
      return;
    }
    const dangerTiles = this.getDangerOverlayTiles();
    for (const tile of dangerTiles) {
      const screenX = ARENA_OFFSET_X + tile.x * TILE_SIZE;
      const screenY = ARENA_OFFSET_Y + tile.y * TILE_SIZE;
      let fill = "rgba(104, 188, 255, 0.16)";
      let stroke = "rgba(184, 230, 255, 0.35)";
      if (tile.etaMs <= 0) {
        fill = "rgba(255, 62, 62, 0.42)";
        stroke = "rgba(255, 189, 176, 0.72)";
      } else if (tile.etaMs <= 700) {
        fill = "rgba(255, 120, 72, 0.34)";
        stroke = "rgba(255, 216, 186, 0.65)";
      } else if (tile.etaMs <= 1500) {
        fill = "rgba(255, 195, 92, 0.24)";
        stroke = "rgba(255, 236, 173, 0.52)";
      }
      this.ctx.fillStyle = fill;
      this.ctx.fillRect(screenX + 5, screenY + 5, TILE_SIZE - 10, TILE_SIZE - 10);
      this.ctx.strokeStyle = stroke;
      this.ctx.strokeRect(screenX + 5.5, screenY + 5.5, TILE_SIZE - 11, TILE_SIZE - 11);
    }
  }

  private getBombPreviewPlayerId(): PlayerId {
    if (this.onlineSession) {
      return this.onlineLocalPlayerId;
    }
    if (this.automationMode) {
      return this.automationControlledPlayer;
    }
    return 1;
  }

  private getBombPreviewTiles(playerId: PlayerId): TileCoord[] {
    if (!this.showBombPreview || this.mode !== "match") {
      return [];
    }
    const player = this.players[playerId];
    if (!player.alive || player.activeBombs >= player.maxBombs) {
      return [];
    }
    const origin = this.getTileFromPosition(player.position);
    const originKey = tileKey(origin.x, origin.y);
    if (this.bombs.some((bomb) => tileKey(bomb.tile.x, bomb.tile.y) === originKey)) {
      return [];
    }
    const blastKeys = this.getBombBlastKeys(origin, player.flameRange);
    const tiles: TileCoord[] = [];
    for (const key of blastKeys) {
      const [xText, yText] = key.split(",");
      const x = Number(xText);
      const y = Number(yText);
      if (Number.isNaN(x) || Number.isNaN(y) || x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) {
        continue;
      }
      tiles.push({ x, y });
    }
    tiles.sort((a, b) => a.y - b.y || a.x - b.x);
    return tiles;
  }

  private drawBombPreviewOverlay(): void {
    if (!this.showBombPreview || this.mode !== "match" || this.roundOutcome || this.paused) {
      return;
    }
    const previewPlayerId = this.getBombPreviewPlayerId();
    const previewTiles = this.getBombPreviewTiles(previewPlayerId);
    if (previewTiles.length === 0) {
      return;
    }
    const origin = this.getTileFromPosition(this.players[previewPlayerId].position);
    for (const tile of previewTiles) {
      const screenX = ARENA_OFFSET_X + tile.x * TILE_SIZE;
      const screenY = ARENA_OFFSET_Y + tile.y * TILE_SIZE;
      const isOrigin = tile.x === origin.x && tile.y === origin.y;
      this.ctx.fillStyle = isOrigin ? "rgba(115, 255, 226, 0.34)" : "rgba(109, 228, 255, 0.22)";
      this.ctx.fillRect(screenX + 6, screenY + 6, TILE_SIZE - 12, TILE_SIZE - 12);
      this.ctx.strokeStyle = isOrigin ? "rgba(208, 255, 241, 0.85)" : "rgba(187, 248, 255, 0.58)";
      this.ctx.strokeRect(screenX + 6.5, screenY + 6.5, TILE_SIZE - 13, TILE_SIZE - 13);
    }
  }

  private drawWall(x: number, y: number): void {
    if (this.assets.props.wall) {
      this.ctx.fillStyle = "rgba(8, 10, 14, 0.35)";
      this.ctx.fillRect(x + 1, y + TILE_SIZE - 5, TILE_SIZE - 2, 5);
      this.ctx.drawImage(this.assets.props.wall, x, y, TILE_SIZE, TILE_SIZE);
      this.ctx.fillStyle = "rgba(226, 221, 190, 0.08)";
      this.ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, 2);
      return;
    }
    this.ctx.fillStyle = "#5b5d5f";
    this.ctx.fillRect(x + 2, y + 4, TILE_SIZE - 4, TILE_SIZE - 6);
    this.ctx.fillStyle = "#797b7d";
    this.ctx.fillRect(x + 4, y + 6, TILE_SIZE - 8, TILE_SIZE - 12);
    this.ctx.fillStyle = "#9c9d97";
    this.ctx.fillRect(x + 3, y + 4, TILE_SIZE - 6, 5);
    this.ctx.fillStyle = "#3b3e42";
    this.ctx.fillRect(x + 4, y + TILE_SIZE - 11, TILE_SIZE - 8, 5);
    this.ctx.fillStyle = "rgba(98, 124, 102, 0.65)";
    this.ctx.fillRect(x + 5, y + 7, 5, 3);
    this.ctx.fillRect(x + TILE_SIZE - 11, y + 12, 4, 3);
    this.ctx.fillStyle = "rgba(185, 191, 185, 0.45)";
    this.ctx.fillRect(x + 8, y + 9, 7, 2);
    this.ctx.fillRect(x + 18, y + 16, 5, 2);
    this.ctx.strokeStyle = "rgba(24, 25, 28, 0.5)";
    this.ctx.strokeRect(x + 2.5, y + 4.5, TILE_SIZE - 5, TILE_SIZE - 7);
  }

  private drawCrate(x: number, y: number): void {
    if (this.assets.props.crate) {
      this.ctx.fillStyle = "rgba(10, 6, 2, 0.28)";
      this.ctx.fillRect(x + 2, y + TILE_SIZE - 4, TILE_SIZE - 4, 4);
      this.ctx.drawImage(this.assets.props.crate, x, y, TILE_SIZE, TILE_SIZE);
      return;
    }
    this.ctx.fillStyle = "#8a512c";
    this.ctx.fillRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    this.ctx.fillStyle = "#cf7b45";
    this.ctx.fillRect(x + 5, y + 5, TILE_SIZE - 10, 5);
    this.ctx.fillStyle = "#5e3118";
    this.ctx.fillRect(x + 5, y + TILE_SIZE - 10, TILE_SIZE - 10, 4);
    this.ctx.strokeStyle = "rgba(255, 214, 168, 0.22)";
    this.ctx.beginPath();
    this.ctx.moveTo(x + 6, y + 6);
    this.ctx.lineTo(x + TILE_SIZE - 6, y + TILE_SIZE - 6);
    this.ctx.moveTo(x + TILE_SIZE - 6, y + 6);
    this.ctx.lineTo(x + 6, y + TILE_SIZE - 6);
    this.ctx.stroke();
  }

  private drawPowerUp(powerUp: PowerUpState): void {
    const x = ARENA_OFFSET_X + powerUp.tile.x * TILE_SIZE;
    const y = ARENA_OFFSET_Y + powerUp.tile.y * TILE_SIZE;
    const sprite = this.assets.powerUps[powerUp.type];
    if (sprite) {
      this.ctx.drawImage(sprite, x, y, TILE_SIZE, TILE_SIZE);
      return;
    }
    const definition = getPowerUpDefinition(powerUp.type);

    this.ctx.fillStyle = "rgba(6, 14, 28, 0.75)";
    this.ctx.fillRect(x + 8, y + 8, 16, 16);
    this.ctx.fillStyle = definition.tint;
    this.ctx.fillRect(x + 10, y + 10, 12, 12);
    this.ctx.fillStyle = "#041120";
    this.ctx.font = "bold 10px monospace";
    this.ctx.textAlign = "center";
    this.ctx.fillText(definition.shortLabel, x + 16, y + 19);
  }

  private drawBomb(bomb: BombState): void {
    const pulse = 0.6 + 0.4 * Math.sin((bomb.fuseMs / 80) * Math.PI);
    const x = ARENA_OFFSET_X + bomb.tile.x * TILE_SIZE;
    const y = ARENA_OFFSET_Y + bomb.tile.y * TILE_SIZE;
    if (this.assets.props.bomb) {
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0.7, pulse);
      this.ctx.drawImage(this.assets.props.bomb, x, y, TILE_SIZE, TILE_SIZE);
      this.ctx.restore();
      return;
    }
    this.ctx.fillStyle = `rgba(255, 239, 173, ${Math.max(0.35, pulse)})`;
    this.ctx.beginPath();
    this.ctx.arc(x + 16, y + 8, 4, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = "#1d2a39";
    this.ctx.beginPath();
    this.ctx.arc(x + 16, y + 18, 10, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = "#d6ecff";
    this.ctx.stroke();
  }

  private drawFlame(flame: FlameState): void {
    const x = ARENA_OFFSET_X + flame.tile.x * TILE_SIZE;
    const y = ARENA_OFFSET_Y + flame.tile.y * TILE_SIZE;
    const alpha = Math.max(0.35, flame.remainingMs / FLAME_DURATION_MS);
    if (this.assets.props.flame) {
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(this.assets.props.flame, x, y, TILE_SIZE, TILE_SIZE);
      this.ctx.restore();
      return;
    }
    this.ctx.fillStyle = `rgba(255, 160, 74, ${alpha})`;
    this.ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
    this.ctx.fillStyle = `rgba(255, 244, 159, ${alpha})`;
    this.ctx.beginPath();
    this.ctx.moveTo(x + 16, y + 5);
    this.ctx.lineTo(x + 26, y + 16);
    this.ctx.lineTo(x + 16, y + 27);
    this.ctx.lineTo(x + 6, y + 16);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawPlayer(player: PlayerState): void {
    if (!player.active) {
      return;
    }
    const position = this.getPlayerPixelPosition(player);
    const palette = PLAYER_COLORS[player.id];
    const x = position.x;
    const y = position.y;
    const alpha = player.alive ? 1 : 0.35;
    const activeCharacter = this.getActiveCharacterEntry(player.id);
    const baseSprites = this.getPlayerSprites(player.id);
    const idleFrames = baseSprites.idle?.[player.direction] ?? [];
    const walkFrames = baseSprites.walk?.[player.direction] ?? [];
    const runFrames = baseSprites.run?.[player.direction] ?? [];
    const castFrames = this.getAnimationFramesForDirection(baseSprites.cast, player.direction);
    const prefersRunMovement = activeCharacter.animations?.walk === false && activeCharacter.animations?.run !== false;
    const channelingSkill = player.skill.id === "ranni-ice-blink" && player.skill.phase === "channeling";
    const movementFrames = prefersRunMovement
      ? (runFrames.length > 0 ? runFrames : walkFrames)
      : (walkFrames.length > 0 ? walkFrames : runFrames);
    const moving = Math.abs(player.velocity.x) > 0.02 || Math.abs(player.velocity.y) > 0.02;
    const castSprite = channelingSkill
      ? pickAnimationFrame(castFrames, player.skill.castElapsedMs, SKILL_FRAME_MS, "hold")
      : null;
    const movementSprite = moving
      ? pickAnimationFrame(movementFrames, this.animationClockMs, WALK_FRAME_MS, "loop")
      : pickAnimationFrame(idleFrames, this.animationClockMs, WALK_FRAME_MS, "loop");
    let sprite = castSprite ?? movementSprite ?? spriteForDirection(baseSprites, player.direction);
    if (!sprite || !this.getSpriteTrimBounds(sprite)) {
      sprite = this.getRenderableSprite(baseSprites, player.direction);
    }

    this.ctx.fillStyle = "rgba(4, 10, 19, 0.34)";
    this.ctx.beginPath();
    this.ctx.ellipse(x + TILE_SIZE * 0.5, y + TILE_SIZE - 2, TILE_SIZE * 0.4, TILE_SIZE * 0.18, 0, 0, Math.PI * 2);
    this.ctx.fill();

    if (sprite) {
      const fullWidth = sprite.naturalWidth || sprite.width || 1;
      const fullHeight = sprite.naturalHeight || sprite.height || 1;
      const trimmedBounds = this.getSpriteTrimBounds(sprite);
      const srcX = trimmedBounds?.x ?? 0;
      const srcY = trimmedBounds?.y ?? 0;
      const srcWidth = trimmedBounds?.width ?? fullWidth;
      const srcHeight = trimmedBounds?.height ?? fullHeight;
      const spriteHeight = TILE_SIZE * PLAYER_SPRITE_HEIGHT_SCALE;
      const maxSpriteWidth = TILE_SIZE * PLAYER_SPRITE_MAX_WIDTH_SCALE;
      const spriteWidth = Math.min(maxSpriteWidth, spriteHeight * (srcWidth / srcHeight));
      const spriteX = x + TILE_SIZE * 0.5 - spriteWidth * 0.5;
      const spriteY = y + TILE_SIZE - spriteHeight + 1;
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(
        sprite,
        srcX,
        srcY,
        srcWidth,
        srcHeight,
        spriteX,
        spriteY,
        spriteWidth,
        spriteHeight,
      );
      this.ctx.restore();
      return;
    }

    this.ctx.fillStyle = "#07111d";
    this.ctx.fillRect(x + 6, y + 3, TILE_SIZE - 12, TILE_SIZE - 4);
    this.ctx.fillStyle = player.alive ? palette.primary : "#8a96a1";
    this.ctx.globalAlpha = alpha;
    this.ctx.fillRect(x + 7, y + 4, TILE_SIZE - 14, TILE_SIZE - 6);
    this.ctx.fillStyle = player.alive ? palette.secondary : "#53606d";
    this.ctx.fillRect(x + 8, y + 8, TILE_SIZE - 16, TILE_SIZE - 13);
    this.ctx.fillStyle = "#f5fbff";

    if (player.direction === "up") {
      this.ctx.fillRect(x + 12, y + 10, 4, 4);
      this.ctx.fillRect(x + 16, y + 10, 4, 4);
    } else if (player.direction === "down") {
      this.ctx.fillRect(x + 12, y + 16, 4, 4);
      this.ctx.fillRect(x + 16, y + 16, 4, 4);
    } else if (player.direction === "left") {
      this.ctx.fillRect(x + 10, y + 14, 4, 4);
      this.ctx.fillRect(x + 10, y + 18, 4, 4);
    } else {
      this.ctx.fillRect(x + 18, y + 14, 4, 4);
      this.ctx.fillRect(x + 18, y + 18, 4, 4);
    }

    this.ctx.globalAlpha = 1;
  }

  private getSpriteTrimBounds(
    sprite: HTMLImageElement,
  ): SpriteTrimBounds | null {
    return this.spriteTrimCache.getBounds(sprite);
  }

  private getAnimationFramesForDirection(
    cycle: Record<Direction, HTMLImageElement[]> | undefined,
    preferredDirection: Direction,
  ): HTMLImageElement[] {
    if (!cycle) {
      return [];
    }
    const preferred = cycle[preferredDirection] ?? [];
    if (preferred.length > 0) {
      return preferred;
    }
    const fallbackOrder: Direction[] = [
      "down",
      "right",
      "left",
      "up",
    ];
    for (const direction of fallbackOrder) {
      if (direction === preferredDirection) {
        continue;
      }
      const frames = cycle[direction] ?? [];
      if (frames.length > 0) {
        return frames;
      }
    }
    return [];
  }

  private getRenderableSprite(
    sprites: DirectionalSprites,
    preferredDirection: Direction,
  ): HTMLImageElement | null {
    const directionOrder: Direction[] = [
      preferredDirection,
      "right",
      "left",
      "down",
      "up",
    ];
    const seen = new Set<Direction>();
    for (const direction of directionOrder) {
      if (seen.has(direction)) {
        continue;
      }
      seen.add(direction);
      const sprite = spriteForDirection(sprites, direction);
      if (!sprite) {
        continue;
      }
      if (this.getSpriteTrimBounds(sprite)) {
        return sprite;
      }
    }
    return null;
  }

  private renderMatchOverlay(): void {
    if (this.paused) {
      this.drawCenterOverlay("PAUSED", "Press Esc to resume.");
      return;
    }

    if (this.roundOutcome) {
      const detail = this.roundOutcome.reason === "elimination"
        ? "Arena rebooting..."
        : this.roundOutcome.reason === "double-ko"
          ? "Both cores overloaded."
          : "No points awarded.";
      this.drawCenterOverlay(this.roundOutcome.message, detail);
    }
  }

  private drawHudText(text: string, x: number, y: number, fillColor: string, outlineColor: string): void {
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = outlineColor;
    this.ctx.strokeText(text, x, y);
    this.ctx.fillStyle = fillColor;
    this.ctx.fillText(text, x, y);
  }

  private renderMatchResult(): void {
    this.drawCenterOverlay(
      this.matchWinner ? `${this.players[this.matchWinner].name} wins the match!` : "Match complete",
      "Q = Sim · R = VOLTAR PRO LOBBY",
    );
    const localChoice = this.matchResultChoice[this.onlineLocalPlayerId];
    this.drawChoicePanel(92, 332, "Q", "Sim", localChoice === "rematch");
    this.drawChoicePanel(252, 332, "R", "VOLTAR PRO LOBBY", localChoice === "lobby");
  }

  private drawChoicePanel(
    x: number,
    y: number,
    keyLabel: string,
    label: string,
    selected: boolean,
  ): void {
    this.ctx.fillStyle = selected ? "rgba(15, 41, 58, 0.96)" : "rgba(15, 20, 30, 0.92)";
    this.ctx.fillRect(x, y, 178, 70);
    this.ctx.strokeStyle = selected ? "#8bdcff" : "rgba(255,255,255,0.2)";
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(x + 0.5, y + 0.5, 177, 69);
    this.ctx.fillStyle = selected ? "#8bdcff" : "rgba(255,255,255,0.08)";
    this.ctx.fillRect(x, y, 178, 3);
    this.ctx.textAlign = "left";
    this.ctx.fillStyle = "#f4fbff";
    this.ctx.font = "bold 10px monospace";
    this.ctx.fillText(keyLabel, x + 12, y + 18);
    this.ctx.fillStyle = "#d7eefc";
    this.ctx.font = "9px monospace";
    this.ctx.fillText(label, x + 12, y + 38);
    this.ctx.fillStyle = "rgba(196, 219, 238, 0.88)";
    this.ctx.fillText(selected ? "Choice locked" : `Press ${keyLabel} to select`, x + 12, y + 54);
  }

  private drawCenterOverlay(title: string, subtitle: string): void {
    this.ctx.fillStyle = "rgba(1, 4, 12, 0.72)";
    this.ctx.fillRect(40, 164, CANVAS_WIDTH - 80, 120);
    this.ctx.strokeStyle = "rgba(133, 216, 255, 0.6)";
    this.ctx.strokeRect(40, 164, CANVAS_WIDTH - 80, 120);
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = "#f4fbff";
    this.ctx.font = "bold 22px monospace";
    this.ctx.fillText(title, CANVAS_WIDTH / 2, 214);
    this.ctx.fillStyle = "#a6d9f7";
    this.ctx.font = "13px monospace";
    this.ctx.fillText(subtitle, CANVAS_WIDTH / 2, 248);
  }

  private renderGameToText(): string {
    const visibleBreakables = Array.from(this.arena.breakable)
      .slice(0, 24)
      .map((key) => {
        const [x, y] = key.split(",");
        return { x: Number(x), y: Number(y) };
      });

    const dangerOverlayTiles = this.showDangerOverlay
      ? this.getDangerOverlayTiles().slice(0, 48)
      : [];
    const previewPlayerId = this.getBombPreviewPlayerId();
    const bombPreviewTiles = this.showBombPreview
      ? this.getBombPreviewTiles(previewPlayerId).slice(0, 48)
      : [];

    const payload = {
      mode: this.mode,
      match: {
        round: this.roundNumber,
        score: this.score,
        remainingMs: Math.round(this.roundTimeMs),
        paused: this.paused,
        menuReady: this.menuReady,
        matchResultChoice: this.matchResultChoice,
        botEnabled: this.botEnabled,
        localBotFill: this.localBotFill,
        activePlayerIds: this.activePlayerIds,
        characterMenuOpen: this.characterMenuOpen,
        suddenDeath: {
          active: this.suddenDeathActive,
          startsAtMs: SUDDEN_DEATH_START_MS,
          tickMs: Math.max(0, Math.round(this.suddenDeathTickMs)),
          progress: this.suddenDeathPath.length > 0
            ? Math.round((this.suddenDeathIndex / this.suddenDeathPath.length) * 1000) / 10
            : 0,
        },
        dangerOverlay: {
          enabled: this.showDangerOverlay,
          maxEtaMs: DANGER_OVERLAY_MAX_ETA_MS,
          tiles: dangerOverlayTiles,
        },
        bombPreview: {
          enabled: this.showBombPreview,
          playerId: previewPlayerId,
          flameRange: this.players[previewPlayerId].flameRange,
          tiles: bombPreviewTiles,
        },
        automationSelectedPlayer: this.automationMode ? this.automationControlledPlayer : null,
        roundOutcome: this.roundOutcome ? {
          winner: this.roundOutcome.winner,
          reason: this.roundOutcome.reason,
          message: this.roundOutcome.message,
        } : null,
      },
      arena: {
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        tileSize: TILE_SIZE,
        origin: { x: ARENA_OFFSET_X, y: ARENA_OFFSET_Y },
        coordinates: "origin top-left, x to right, y to bottom",
      },
      activePlayerIds: [...this.activePlayerIds],
      players: this.activePlayerIds.map((id) => {
        const player = this.players[id];
        const tile = this.getTileFromPosition(player.position);
        const pixel = this.getPlayerPixelPosition(player);
        return {
          id: player.id,
          name: player.name,
          tile,
          pixel,
          velocity: {
            x: Math.round(player.velocity.x * 100) / 100,
            y: Math.round(player.velocity.y * 100) / 100,
          },
          direction: player.direction,
          botControlled: this.isBotControlled(id),
          character: {
            id: this.getActiveCharacterEntry(id).id,
            name: this.getActiveCharacterEntry(id).name,
            selectedIndex: this.selectedCharacterIndex[id],
            pendingIndex: this.pendingCharacterIndex[id],
            locked: this.characterLocked[id],
            menuOpen: this.characterMenuOpen[id],
          },
          alive: player.alive,
          bombsAvailable: player.maxBombs - player.activeBombs,
          bombCapacity: player.maxBombs,
          flameRange: player.flameRange,
          speedLevel: player.speedLevel,
          remoteLevel: player.remoteLevel,
          shieldCharges: player.shieldCharges,
          bombPassLevel: player.bombPassLevel,
          kickLevel: player.kickLevel,
          skillSlots: this.getHudSkillSlots(id).map((slot) => ({
            type: slot.type,
            acquired: slot.acquired,
            level: slot.level,
            value: slot.valueLabel,
            key: slot.keyLabel,
          })),
          flameGuardMs: Math.round(player.flameGuardMs),
          spawnProtectionMs: Math.round(player.spawnProtectionMs),
          skill: {
            id: player.skill.id,
            phase: player.skill.phase,
            channelRemainingMs: Math.round(player.skill.channelRemainingMs),
            cooldownRemainingMs: Math.round(player.skill.cooldownRemainingMs),
          },
        };
      }),
      bombs: this.bombs.map((bomb) => ({
        ownerId: bomb.ownerId,
        tile: bomb.tile,
        flameRange: bomb.flameRange,
        fuseMs: Math.max(0, Math.round(bomb.fuseMs)),
      })),
      flames: this.flames.map((flame) => ({
        tile: flame.tile,
        remainingMs: Math.round(flame.remainingMs),
      })),
      blocks: {
        remaining: this.arena.breakable.size,
        visibleBreakables,
      },
      powerups: this.arena.powerUps
        .filter((powerUp) => powerUp.revealed && !powerUp.collected)
        .map((powerUp) => ({
          type: powerUp.type,
          tile: powerUp.tile,
          visible: powerUp.revealed,
          collected: powerUp.collected,
        })),
    };

    return JSON.stringify(payload);
  }
}




