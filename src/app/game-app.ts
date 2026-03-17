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
  MAX_BOMBS,
  MAX_RANGE,
  MAX_SPEED_LEVEL,
  MIN_MOVE_MS,
  PLAYER_COLORS,
  ROUND_DURATION_MS,
  ROUND_END_DELAY_MS,
  SPEED_STEP_MS,
  TARGET_WINS,
  TILE_SIZE,
} from "../core/config";
import { spriteForDirection, type GameAssets } from "./assets";
import type {
  ArenaState,
  BombState,
  Direction,
  FlameState,
  MatchScore,
  Mode,
  PixelCoord,
  PlayerId,
  PlayerState,
  PowerUpState,
  RoundOutcome,
  TileCoord,
} from "../core/types";
import { InputManager } from "../engine/input";
import { createArena, tileKey } from "../game/arena";

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
interface SpriteCropProfile {
  srcX: number;
  srcY: number;
  srcWidth: number;
  srcHeight: number;
}

interface PlayerSpriteProfile extends SpriteCropProfile {
  heightScale: number;
  menuHeight: number;
  menuOffsetY: number;
  allowWalkAnimation: boolean;
  directional?: Partial<Record<Direction, SpriteCropProfile>>;
}

const PLAYER_SPRITE_PROFILE: Record<PlayerId, PlayerSpriteProfile> = {
  1: {
    srcX: 44,
    srcY: 39,
    srcWidth: 65,
    srcHeight: 81,
    heightScale: 1.14,
    menuHeight: 58,
    menuOffsetY: 22,
    allowWalkAnimation: true,
    directional: {
      down: { srcX: 56, srcY: 40, srcWidth: 57, srcHeight: 79 },
      right: { srcX: 51, srcY: 39, srcWidth: 65, srcHeight: 80 },
      up: { srcX: 50, srcY: 40, srcWidth: 53, srcHeight: 78 },
      left: { srcX: 44, srcY: 39, srcWidth: 65, srcHeight: 81 },
    },
  },
  2: {
    srcX: 29,
    srcY: 21,
    srcWidth: 27,
    srcHeight: 44,
    heightScale: 1.0,
    menuHeight: 52,
    menuOffsetY: 16,
    allowWalkAnimation: true,
  },
};
const BOT_BOMB_COOLDOWN_MS = 900;
const BOT_DANGER_FUSE_MS = 1000;
const BOT_DANGER_ARRIVAL_BUFFER_MS = 140;
const BOT_SCAN_RADIUS = 7;
const BOT_SUDDEN_DEATH_LOOKAHEAD_MS = 2100;
const WALK_FRAME_MS = 100;
const SPAWN_PROTECTION_MS = 2200;
const SUDDEN_DEATH_START_MS = 25_000;
const SUDDEN_DEATH_TICK_MS = 800;
const SUDDEN_DEATH_FLAME_MS = 900;
const CANVAS_BACKBUFFER_SCALE = 2;
const CANVAS_VIEWPORT_PADDING = 32;

interface BotDecision {
  direction: Direction | null;
  placeBomb: boolean;
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

export class GameApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: InputManager;
  private readonly root: HTMLElement;
  private readonly assets: GameAssets;

  private lastTimestamp = 0;
  private accumulatorMs = 0;

  private mode: Mode = "boot";
  private arena: ArenaState = createArena();
  private players: Record<PlayerId, PlayerState> = this.createPlayers();
  private bombs: BombState[] = [];
  private flames: FlameState[] = [];
  private nextBombId = 1;

  private menuReady: Record<PlayerId, boolean> = { 1: false, 2: false };
  private rematchReady: Record<PlayerId, boolean> = { 1: false, 2: false };
  private score: MatchScore = { 1: 0, 2: 0 };
  private roundNumber = 1;
  private roundTimeMs = ROUND_DURATION_MS;
  private paused = false;
  private roundOutcome: RoundOutcome | null = null;
  private matchWinner: PlayerId | null = null;
  private readonly automationMode = navigator.webdriver;
  private automationControlledPlayer: PlayerId = 2;
  private botEnabled = this.automationMode;
  private botBombCooldownMs = 0;
  private animationClockMs = 0;
  private suddenDeathActive = false;
  private suddenDeathTickMs = SUDDEN_DEATH_TICK_MS;
  private suddenDeathIndex = 0;
  private suddenDeathPath: TileCoord[] = [];

  constructor(root: HTMLElement, assets: GameAssets) {
    this.root = root;
    this.assets = assets;
    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_WIDTH * CANVAS_BACKBUFFER_SCALE;
    this.canvas.height = CANVAS_HEIGHT * CANVAS_BACKBUFFER_SCALE;
    this.canvas.setAttribute("aria-label", "Mistbridge Arena game canvas");

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context not available");
    }
    this.ctx = ctx;
    this.ctx.setTransform(CANVAS_BACKBUFFER_SCALE, 0, 0, CANVAS_BACKBUFFER_SCALE, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.input = new InputManager(window);
  }

  public start(): void {
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

    this.render();
    this.input.endFrame();
    window.requestAnimationFrame(this.loop);
  };

  private registerWindowHooks(): void {
    window.addEventListener("resize", this.syncCanvasDisplaySize);
    window.addEventListener("fullscreenchange", this.syncCanvasDisplaySize);
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
    if (!("style" in this.canvas)) {
      return;
    }
    const viewportWidth = typeof window.innerWidth === "number" ? window.innerWidth : CANVAS_WIDTH + CANVAS_VIEWPORT_PADDING;
    const viewportHeight = typeof window.innerHeight === "number"
      ? window.innerHeight
      : CANVAS_HEIGHT + CANVAS_VIEWPORT_PADDING;
    const availableWidth = Math.max(160, viewportWidth - CANVAS_VIEWPORT_PADDING);
    const availableHeight = Math.max(160, viewportHeight - CANVAS_VIEWPORT_PADDING);
    const fitScale = Math.min(availableWidth / CANVAS_WIDTH, availableHeight / CANVAS_HEIGHT);
    const integerScale = Math.floor(fitScale);
    const displayScale = integerScale >= 1 ? integerScale : Math.max(0.5, Math.min(1, fitScale));
    const displayWidth = Math.max(1, Math.round(CANVAS_WIDTH * displayScale));
    const displayHeight = Math.max(1, Math.round(CANVAS_HEIGHT * displayScale));
    this.canvas.style.width = `${displayWidth}px`;
    this.canvas.style.height = `${displayHeight}px`;
  };

  private update(deltaMs: number): void {
    if (this.input.consumePress("KeyF")) {
      void this.toggleFullscreen();
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
  }

  private updateMenu(): void {
    if (this.input.consumePress("KeyB")) {
      this.botEnabled = !this.botEnabled;
      this.menuReady[2] = this.botEnabled;
      this.syncPlayerLabels();
    }

    if (this.botEnabled) {
      this.menuReady[2] = true;
    }

    if (this.automationMode && this.input.consumePress("Enter")) {
      this.menuReady = { 1: true, 2: this.botEnabled };
    }
    this.handleReadyInput(this.menuReady);
    if (this.menuReady[1] && this.menuReady[2]) {
      this.startMatch();
    }
  }

  private updateMatch(deltaMs: number): void {
    if (this.input.consumePress("Escape")) {
      this.paused = !this.paused;
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
    if (this.botEnabled) {
      this.rematchReady[2] = true;
    }

    if (this.automationMode && this.input.consumePress("Enter")) {
      this.rematchReady = { 1: true, 2: this.botEnabled };
    }
    this.handleReadyInput(this.rematchReady);
    if (this.rematchReady[1] && this.rematchReady[2]) {
      this.menuReady = { 1: false, 2: false };
      this.startMatch();
    }
  }

  private handleReadyInput(target: Record<PlayerId, boolean>): void {
    if (this.input.consumePress(KEY_BINDINGS[1].ready)) {
      target[1] = true;
    }
    if (this.input.consumePress(KEY_BINDINGS[2].ready)) {
      target[2] = true;
    }
  }

  private startMatch(): void {
    // Prevent queued key presses from previous screens leaking into active gameplay.
    this.input.clearPresses();
    this.menuReady = { 1: false, 2: false };
    this.score = { 1: 0, 2: 0 };
    this.roundNumber = 1;
    this.matchWinner = null;
    this.rematchReady = { 1: false, 2: false };
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
    this.animationClockMs = 0;
    this.suddenDeathActive = false;
    this.suddenDeathTickMs = SUDDEN_DEATH_TICK_MS;
    this.suddenDeathIndex = 0;
    this.suddenDeathPath = this.buildSuddenDeathPath();
  }

  private createPlayers(): Record<PlayerId, PlayerState> {
    return {
      1: this.createPlayer(1, "P1", { x: 2, y: 1 }, "down"),
      2: this.createPlayer(2, this.isBotControlled(2) ? "BOT" : "P2", { x: GRID_WIDTH - 3, y: GRID_HEIGHT - 2 }, "up"),
    };
  }

  private syncPlayerLabels(): void {
    this.players[1].name = "P1";
    this.players[2].name = this.isBotControlled(2) ? "BOT" : "P2";
  }

  private createPlayer(id: PlayerId, name: string, tile: TileCoord, direction: Direction): PlayerState {
    const center = this.getTileCenter(tile);
    return {
      id,
      name,
      tile: { ...tile },
      position: center,
      velocity: { x: 0, y: 0 },
      alive: true,
      direction,
      lastMoveDirection: null,
      maxBombs: 1,
      activeBombs: 0,
      flameRange: 1,
      speedLevel: 0,
      spawnProtectionMs: SPAWN_PROTECTION_MS,
    };
  }

  private updatePlayers(deltaMs: number): void {
    for (const id of [1, 2] as const) {
      const player = this.players[id];
      if (!player.alive) {
        continue;
      }
      player.spawnProtectionMs = Math.max(0, player.spawnProtectionMs - deltaMs);

      const botDecision = this.isBotControlled(id) ? this.getBotDecision(player) : null;
      const automationBomb = this.automationMode
        ? this.automationControlledPlayer === id && this.input.consumePress("Space")
        : false;
      const nativeBomb = this.input.consumePress(KEY_BINDINGS[id].bomb);
      if (botDecision?.placeBomb || automationBomb || nativeBomb) {
        this.placeBomb(player);
      }

      const direction = botDecision?.direction ?? this.getMovementDirection(id);
      if (direction) {
        const actualDirection = this.resolveMovementDirection(player, direction, deltaMs);
        player.direction = actualDirection;
        this.movePlayer(player, actualDirection, deltaMs);
      } else {
        player.velocity.x = 0;
        player.velocity.y = 0;
      }

      player.tile = this.getTileFromPosition(player.position);
    }

    this.resolvePlayerDeathsFromFlames();
  }

  private getMovementDirection(id: PlayerId): Direction | null {
    if (this.isBotControlled(id)) {
      return null;
    }
    if (this.automationMode) {
      if (this.automationControlledPlayer === id) {
        return this.input.getMovementDirection(2) ?? this.input.getMovementDirection(1);
      }
      return null;
    }
    return this.input.getMovementDirection(id);
  }

  private isBotControlled(id: PlayerId): boolean {
    return id === 2 && this.botEnabled;
  }

  private getBotDecision(player: PlayerState): BotDecision {
    const enemy = this.players[1];
    const playerTile = this.getTileFromPosition(player.position);
    const dangerMap = this.getDangerMap();
    const playerTileKey = tileKey(playerTile.x, playerTile.y);
    const currentDangerMs = dangerMap.get(playerTileKey);
    const nowDanger = currentDangerMs !== undefined && currentDangerMs <= this.getMoveDuration(player) + BOT_DANGER_ARRIVAL_BUFFER_MS;

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

    const adjacentEnemy = this.getTileDistance(playerTile, enemy.tile) <= 1;
    const enemyInBombLine = this.canBombReachTile(playerTile, enemy.tile, player.flameRange);
    const adjacentBreakable = this.hasAdjacentBreakable(playerTile);
    const shouldDropBomb = (adjacentEnemy || adjacentBreakable || enemyInBombLine) && this.canBotPlaceBomb(player);
    if (shouldDropBomb) {
      this.botBombCooldownMs = BOT_BOMB_COOLDOWN_MS;
      return { direction: null, placeBomb: true };
    }

    const powerUpTarget = this.findNearestReachableTarget(player, (tile) => this.hasVisiblePowerUp(tile));
    if (powerUpTarget) {
      return { direction: powerUpTarget, placeBomb: false };
    }

    const breakableTarget = this.findNearestReachableTarget(player, (tile) => this.hasAdjacentBreakable(tile));
    if (breakableTarget) {
      return { direction: breakableTarget, placeBomb: false };
    }

    const attackPositionTarget = this.findNearestReachableTarget(
      player,
      (tile) => this.canBombReachTile(tile, enemy.tile, player.flameRange) && this.canBotPlaceBombAtTile(player, tile, false),
    );
    if (attackPositionTarget) {
      return { direction: attackPositionTarget, placeBomb: false };
    }

    const chaseEnemy = this.findDirectionToNearestTile(player, (tile) => this.getTileDistance(tile, enemy.tile) <= 1);
    const patrolDirection = this.findDirectionToNearestTile(player, () => true, dangerMap);
    return { direction: chaseEnemy ?? patrolDirection, placeBomb: false };
  }

  private canBotPlaceBomb(player: PlayerState): boolean {
    const playerTile = this.getTileFromPosition(player.position);
    return this.canBotPlaceBombAtTile(player, playerTile, true);
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
      const arrivalMs = current.distance * this.getMoveDuration(player);
      if (current.distance > 0 && this.isTileSafeForArrival(dangerAfterBomb, current.tile, arrivalMs)) {
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

  private findNearestReachableTarget(player: PlayerState, predicate: (tile: TileCoord) => boolean): Direction | null {
    const dangerMap = this.getDangerMap();
    return this.findDirectionToNearestTile(player, predicate, dangerMap);
  }

  private findDirectionToNearestTile(
    player: PlayerState,
    predicate: (tile: TileCoord) => boolean,
    blockedDanger?: Map<string, number>,
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
      const currentSafe = this.isTileSafeForArrival(danger, current.tile, arrivalMs);
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
          || !this.isTileSafeForArrival(danger, neighbor.tile, neighborArrivalMs)
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

  private hasVisiblePowerUp(tile: TileCoord): boolean {
    return this.arena.powerUps.some(
      (powerUp) => powerUp.revealed && !powerUp.collected && powerUp.tile.x === tile.x && powerUp.tile.y === tile.y,
    );
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
        range: this.players[bomb.ownerId].flameRange,
        fuseMs: Math.max(0, bomb.fuseMs),
        blastKeys: this.getBombBlastKeys(bomb.tile, this.players[bomb.ownerId].flameRange),
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
    const key = tileKey(tile.x, tile.y);
    const dangerMs = danger.get(key);
    return dangerMs === undefined || dangerMs > arrivalMs + BOT_DANGER_ARRIVAL_BUFFER_MS;
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

  private resolveMovementDirection(player: PlayerState, desiredDirection: Direction, deltaMs: number): Direction {
    const desiredOption = this.evaluateMovementOption(player, desiredDirection, deltaMs);
    const desiredCanMove = desiredOption.combinedFree || desiredOption.laneOnlyFree || desiredOption.forwardOnlyFree;

    const lastDirection = player.lastMoveDirection;
    if (!lastDirection || lastDirection === desiredDirection || !this.arePerpendicular(lastDirection, desiredDirection)) {
      return desiredDirection;
    }

    if (desiredCanMove) {
      return desiredDirection;
    }

    const continueOption = this.evaluateMovementOption(player, lastDirection, deltaMs);
    const continueAdvances = continueOption.combinedFree;

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

    const combinedMove = { x: nextX, y: nextY };
    const laneOnlyMove = horizontal
      ? { x: player.position.x, y: nextY }
      : { x: nextX, y: player.position.y };
    const forwardOnlyMove = horizontal
      ? { x: nextX, y: player.position.y }
      : { x: player.position.x, y: nextY };

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
    const start = { ...player.position };
    const option = this.evaluateMovementOption(player, direction, deltaMs);

    if (option.combinedFree) {
      player.position = option.combinedMove;
      player.velocity = {
        x: (player.position.x - start.x) / (deltaMs / 1000),
        y: (player.position.y - start.y) / (deltaMs / 1000),
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
    if (option.laneOnlyFree) {
      player.position = option.laneOnlyMove;
      moved = true;
    }
    if (option.forwardOnlyFree && !moved) {
      player.position = option.forwardOnlyMove;
      moved = true;
    }

    player.velocity = moved
      ? {
          x: (player.position.x - start.x) / (deltaMs / 1000),
          y: (player.position.y - start.y) / (deltaMs / 1000),
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
  }

  private arePerpendicular(a: Direction, b: Direction): boolean {
    const aHorizontal = a === "left" || a === "right";
    const bHorizontal = b === "left" || b === "right";
    return aHorizontal !== bHorizontal;
  }

  private canOccupyPosition(player: PlayerState, position: PixelCoord): boolean {
    const left = position.x - PLAYER_HITBOX_HALF;
    const right = position.x + PLAYER_HITBOX_HALF;
    const top = position.y - PLAYER_HITBOX_HALF;
    const bottom = position.y + PLAYER_HITBOX_HALF;

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
    if (tileX < 0 || tileY < 0 || tileX >= GRID_WIDTH || tileY >= GRID_HEIGHT) {
      return true;
    }

    const key = tileKey(tileX, tileY);
    if (this.arena.solid.has(key) || this.arena.breakable.has(key)) {
      return true;
    }

    for (const bomb of this.bombs) {
      if (bomb.tile.x !== tileX || bomb.tile.y !== tileY) {
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
    return {
      x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
      y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
    };
  }

  private getTileFromPosition(position: PixelCoord): TileCoord {
    return {
      x: Math.max(0, Math.min(GRID_WIDTH - 1, Math.floor(position.x / TILE_SIZE))),
      y: Math.max(0, Math.min(GRID_HEIGHT - 1, Math.floor(position.y / TILE_SIZE))),
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

  private placeBomb(player: PlayerState): void {
    if (!player.alive || player.activeBombs >= player.maxBombs) {
      return;
    }
    const tile = this.getTileFromPosition(player.position);
    player.tile = tile;
    const key = tileKey(tile.x, tile.y);
    if (this.bombs.some((bomb) => tileKey(bomb.tile.x, bomb.tile.y) === key)) {
      return;
    }

    this.bombs.push({
      id: this.nextBombId,
      ownerId: player.id,
      tile: { ...tile },
      fuseMs: BOMB_FUSE_MS,
      ownerCanPass: true,
    });
    this.nextBombId += 1;
    player.activeBombs += 1;
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

    const flameTiles = new Set<string>();
    const range = this.players[bomb.ownerId].flameRange;
    flameTiles.add(tileKey(bomb.tile.x, bomb.tile.y));

    for (const direction of Object.values(directionDelta)) {
      for (let step = 1; step <= range; step += 1) {
        const x = bomb.tile.x + direction.x * step;
        const y = bomb.tile.y + direction.y * step;
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
          break;
        }
      }
    }

    flameTiles.forEach((key) => {
      const [xText, yText] = key.split(",");
      this.addFlame({ x: Number(xText), y: Number(yText) });
    });

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
    for (const id of [1, 2] as const) {
      const player = this.players[id];
      if (!player.alive) {
        continue;
      }
      player.tile = this.getTileFromPosition(player.position);
      if (flameKeys.has(tileKey(player.tile.x, player.tile.y))) {
        if (player.spawnProtectionMs > 0) {
          continue;
        }
        player.alive = false;
        player.velocity = { x: 0, y: 0 };
      }
    }
  }

  private collectPowerUps(): void {
    for (const id of [1, 2] as const) {
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
          if (powerUp.type === "bomb-up") {
            player.maxBombs = Math.min(MAX_BOMBS, player.maxBombs + 1);
          } else if (powerUp.type === "flame-up") {
            player.flameRange = Math.min(MAX_RANGE, player.flameRange + 1);
          } else {
            player.speedLevel = Math.min(MAX_SPEED_LEVEL, player.speedLevel + 1);
          }
        }
      }
    }
  }

  private evaluateRoundState(): void {
    const alivePlayers = ([1, 2] as const).filter((id) => this.players[id].alive);
    if (alivePlayers.length === 2) {
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
    if (this.score[1] >= TARGET_WINS) {
      this.matchWinner = 1;
      this.rematchReady = { 1: false, 2: false };
      this.input.clearPresses();
      this.mode = "match-result";
      return;
    }
    if (this.score[2] >= TARGET_WINS) {
      this.matchWinner = 2;
      this.rematchReady = { 1: false, 2: false };
      this.input.clearPresses();
      this.mode = "match-result";
      return;
    }
    this.roundNumber += 1;
    this.resetRound();
  }

  private async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await this.canvas.requestFullscreen();
  }

  private getPlayerPixelPosition(player: PlayerState): PixelCoord {
    return {
      x: ARENA_OFFSET_X + player.position.x - TILE_SIZE * 0.5,
      y: ARENA_OFFSET_Y + player.position.y - TILE_SIZE * 0.5,
    };
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
      return;
    }

    this.renderMatchResult();
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
    this.ctx.fillStyle = "#edf3ff";
    this.ctx.font = "bold 28px 'Trebuchet MS', sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText("MISTBRIDGE ARENA", CANVAS_WIDTH / 2, 100);

    this.ctx.fillStyle = "#a8c8e8";
    this.ctx.font = "bold 14px monospace";
    this.ctx.fillText("Clifftop ruins. Tight corridors. First to 2 rounds.", CANVAS_WIDTH / 2, 132);

    this.ctx.fillStyle = "rgba(12, 18, 28, 0.86)";
    this.ctx.fillRect(52, 164, 376, 220);
    this.ctx.strokeStyle = "rgba(167, 196, 229, 0.5)";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(52, 164, 376, 220);

    this.ctx.textAlign = "left";
    this.ctx.fillStyle = "#d8e4f0";
    this.ctx.font = "13px monospace";
    const instructions = [
      "P1 Move: WASD   Bomb: Q   Ready: E",
      this.botEnabled ? "P2 is BOT (toggle with B in menu)" : "P2 Move: Arrows Bomb: O   Ready: P",
      "Pause: Esc     Fullscreen: F",
      "Power-ups: +Bomb  +Flame  +Speed",
    ];
    instructions.forEach((line, index) => {
      this.ctx.fillText(line, 76, 208 + index * 28);
    });

    this.drawMenuPortrait(56, 286, 1);
    this.drawMenuPortrait(388, 286, 2);

    this.drawReadyPanel(92, 306, 1, this.menuReady[1], "Press E to arm reactor");
    this.drawReadyPanel(
      252,
      306,
      2,
      this.menuReady[2],
      this.botEnabled ? "Auto-ready enabled" : "Press P to arm reactor",
      this.botEnabled ? "BOT" : "P2",
    );

    if (this.menuReady[1] && this.menuReady[2]) {
      this.ctx.fillStyle = "#f7ebc3";
      this.ctx.textAlign = "center";
      this.ctx.fillText("Loading arena...", CANVAS_WIDTH / 2, 414);
    } else {
      this.ctx.fillStyle = "#b3c9dd";
      this.ctx.textAlign = "center";
      this.ctx.fillText(this.botEnabled ? "Press E to start vs BOT." : "Both pilots must ready up.", CANVAS_WIDTH / 2, 414);
    }
  }

  private drawMenuPortrait(x: number, y: number, playerId: PlayerId): void {
    const sprite = this.assets.players[playerId].down;
    if (!sprite) {
      return;
    }
    const profile = this.getPlayerSpriteCrop(playerId, "down");
    const playerProfile = PLAYER_SPRITE_PROFILE[playerId];
    const menuHeight = profile.menuHeight;
    const menuWidth = menuHeight * (profile.srcWidth / profile.srcHeight);
    this.ctx.drawImage(
      sprite,
      profile.srcX,
      profile.srcY,
      profile.srcWidth,
      profile.srcHeight,
      x - menuWidth * 0.5,
      y - playerProfile.menuOffsetY,
      menuWidth,
      menuHeight,
    );
  }

  private drawReadyPanel(
    x: number,
    y: number,
    playerId: PlayerId,
    ready: boolean,
    hint: string,
    nameOverride?: string,
  ): void {
    const palette = PLAYER_COLORS[playerId];
    const name = nameOverride ?? this.players[playerId].name;
    this.ctx.fillStyle = ready ? palette.glow : "rgba(255,255,255,0.05)";
    this.ctx.fillRect(x, y, 136, 56);
    this.ctx.strokeStyle = ready ? palette.primary : "rgba(255,255,255,0.2)";
    this.ctx.strokeRect(x, y, 136, 56);
    this.ctx.fillStyle = palette.primary;
    this.ctx.textAlign = "left";
    this.ctx.font = "bold 14px monospace";
    this.ctx.fillText(ready ? `${name} READY` : `${name} STANDBY`, x + 10, y + 20);
    this.ctx.fillStyle = "#d7eefc";
    this.ctx.font = "11px monospace";
    this.ctx.fillText(hint, x + 10, y + 40);
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

    this.drawHudPanel(10, 8, 64, 36, "rgba(183, 223, 255, 0.6)");
    this.drawHudPanel(84, 8, 118, 36, "rgba(108, 244, 255, 0.65)");
    this.drawHudPanel(206, 6, 68, 40, "rgba(244, 248, 255, 0.55)");
    this.drawHudPanel(278, 8, 118, 36, "rgba(255, 139, 91, 0.65)");
    this.drawHudPanel(406, 8, 64, 36, "rgba(183, 223, 255, 0.6)");

    this.ctx.textAlign = "left";
    this.ctx.font = "bold 8px monospace";
    this.drawHudText("ROUND", 18, 20, "#d8eaf8", "rgba(4, 10, 19, 0.9)");
    this.drawHudText("GOAL", 18, 36, "#d8eaf8", "rgba(4, 10, 19, 0.9)");
    this.ctx.textAlign = "right";
    this.ctx.font = "bold 13px monospace";
    this.drawHudText(String(this.roundNumber), 64, 21, "#f7fbff", "rgba(4, 10, 19, 0.9)");
    this.drawHudText(String(TARGET_WINS), 64, 37, "#f7fbff", "rgba(4, 10, 19, 0.9)");

    this.ctx.textAlign = "center";
    this.ctx.font = "bold 8px monospace";
    this.drawHudText("TIME", 240, 18, "#b8cde2", "rgba(4, 10, 19, 0.9)");
    this.ctx.font = "bold 16px monospace";
    this.drawHudText(
      Math.ceil(this.roundTimeMs / 1000).toString().padStart(2, "0"),
      240,
      36,
      "#f7fbff",
      "rgba(4, 10, 19, 0.9)",
    );

    this.renderPlayerHud(1, 143, 8);
    this.renderPlayerHud(2, 337, 8);

    this.ctx.textAlign = "center";
    this.ctx.font = "bold 8px monospace";
    this.drawHudText("MODE", 438, 20, "#b8cde2", "rgba(4, 10, 19, 0.9)");
    this.ctx.font = "bold 11px monospace";
    this.drawHudText(this.botEnabled ? "VS BOT" : "VS P2", 438, 36, "#f7fbff", "rgba(4, 10, 19, 0.9)");

    if (!this.roundOutcome) {
      this.ctx.textAlign = "center";
      this.ctx.font = "bold 8px monospace";
      if (this.suddenDeathActive) {
        this.drawHudText("SUDDEN DEATH", 240, 48, "#ffb58f", "rgba(4, 10, 19, 0.9)");
      } else {
        const untilSuddenDeath = Math.max(0, this.roundTimeMs - SUDDEN_DEATH_START_MS);
        this.drawHudText(
          `SD ${Math.ceil(untilSuddenDeath / 1000)}s`,
          240,
          48,
          "rgba(203, 222, 238, 0.82)",
          "rgba(4, 10, 19, 0.9)",
        );
      }
    }
  }

  private renderPlayerHud(playerId: PlayerId, centerX: number, y: number): void {
    const player = this.players[playerId];
    const palette = PLAYER_COLORS[playerId];
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = palette.primary;
    this.ctx.font = "bold 12px monospace";
    this.drawHudText(`${player.name} ${this.score[playerId]}`, centerX, y + 13, palette.primary, "rgba(4, 10, 19, 0.9)");
    this.ctx.fillStyle = "#dbefff";
    this.ctx.font = "8px monospace";
    this.drawHudText(
      `B ${player.maxBombs}   F ${player.flameRange}   S ${player.speedLevel}`,
      centerX,
      y + 24,
      "#dbefff",
      "rgba(4, 10, 19, 0.9)",
    );
    const status = this.isBotControlled(playerId)
      ? player.alive
        ? "BOT ONLINE"
        : "BOT DOWN"
      : player.alive
        ? "ONLINE"
        : "DOWN";
    this.ctx.fillStyle = player.alive ? "rgba(218, 245, 255, 0.9)" : "rgba(210, 220, 231, 0.55)";
    this.ctx.font = "bold 7px monospace";
    this.drawHudText(status, centerX, y + 34, player.alive ? "rgba(218, 245, 255, 0.9)" : "rgba(210, 220, 231, 0.55)", "rgba(4, 10, 19, 0.8)");
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
        const isCenterLane = x === centerX || y === centerY;
        const isSideLane = x === sideColumn || x === farSideColumn || y === sideRow || y === farSideRow;
        const isSpawnBay = (x <= 2 && y <= 2) || (x >= GRID_WIDTH - 3 && y >= GRID_HEIGHT - 3);
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
        const floorSprite = isSpawnBay
          ? this.assets.floor.spawn
          : isCenterLane || isSideLane
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
        }
      }
    }

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

    for (const id of [1, 2] as const) {
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
    const colors = {
      "bomb-up": "#f4d35e",
      "flame-up": "#ff7d66",
      "speed-up": "#7cffb2",
    } as const;

    this.ctx.fillStyle = "rgba(6, 14, 28, 0.75)";
    this.ctx.fillRect(x + 8, y + 8, 16, 16);
    this.ctx.fillStyle = colors[powerUp.type];
    this.ctx.fillRect(x + 10, y + 10, 12, 12);
    this.ctx.fillStyle = "#041120";
    this.ctx.font = "bold 10px monospace";
    this.ctx.textAlign = "center";
    const label = powerUp.type === "bomb-up" ? "B" : powerUp.type === "flame-up" ? "F" : "S";
    this.ctx.fillText(label, x + 16, y + 19);
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
    const position = this.getPlayerPixelPosition(player);
    const palette = PLAYER_COLORS[player.id];
    const profile = this.getPlayerSpriteCrop(player.id, player.direction);
    const playerProfile = PLAYER_SPRITE_PROFILE[player.id];
    const spriteHeight = TILE_SIZE * profile.heightScale;
    const spriteWidth = spriteHeight * (profile.srcWidth / profile.srcHeight);
    const spriteOffsetX = (spriteWidth - TILE_SIZE) * 0.5;
    const spriteOffsetY = spriteHeight - TILE_SIZE + 1;
    const x = position.x;
    const y = position.y;
    const alpha = player.alive ? 1 : 0.35;
    const baseSprites = this.assets.players[player.id];
    const walkFrames = playerProfile.allowWalkAnimation ? (baseSprites.walk?.[player.direction] ?? []) : [];
    const moving = Math.abs(player.velocity.x) > 0.02 || Math.abs(player.velocity.y) > 0.02;
    const frameIndex = Math.floor(this.animationClockMs / WALK_FRAME_MS);
    const sprite = moving && walkFrames.length > 0
      ? walkFrames[frameIndex % walkFrames.length]
      : spriteForDirection(baseSprites, player.direction);
    const spriteX = x - spriteOffsetX;
    const spriteY = y - spriteOffsetY;

    this.ctx.fillStyle = "rgba(4, 10, 19, 0.34)";
    this.ctx.beginPath();
    this.ctx.ellipse(x + TILE_SIZE * 0.5, y + TILE_SIZE - 2, TILE_SIZE * 0.4, TILE_SIZE * 0.18, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = player.alive ? palette.glow : "rgba(255,255,255,0.08)";
    this.ctx.fillRect(x + 5, y + 5, TILE_SIZE - 10, TILE_SIZE - 6);

    if (sprite) {
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(
        sprite,
        profile.srcX,
        profile.srcY,
        profile.srcWidth,
        profile.srcHeight,
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

  private getPlayerSpriteCrop(playerId: PlayerId, direction: Direction): PlayerSpriteProfile {
    const base = PLAYER_SPRITE_PROFILE[playerId];
    const directionCrop = base.directional?.[direction];
    if (!directionCrop) {
      return base;
    }
    return {
      ...base,
      ...directionCrop,
    };
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
      "Both pilots press Ready for a rematch.",
    );
    this.drawReadyPanel(92, 332, 1, this.rematchReady[1], "Press E to rematch");
    this.drawReadyPanel(
      252,
      332,
      2,
      this.rematchReady[2],
      this.botEnabled ? "BOT auto-ready" : "Press P to rematch",
      this.botEnabled ? "BOT" : "P2",
    );
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

    const payload = {
      mode: this.mode,
      match: {
        round: this.roundNumber,
        score: this.score,
        remainingMs: Math.round(this.roundTimeMs),
        paused: this.paused,
        menuReady: this.menuReady,
        rematchReady: this.rematchReady,
        botEnabled: this.botEnabled,
        suddenDeath: {
          active: this.suddenDeathActive,
          startsAtMs: SUDDEN_DEATH_START_MS,
          tickMs: Math.max(0, Math.round(this.suddenDeathTickMs)),
          progress: this.suddenDeathPath.length > 0
            ? Math.round((this.suddenDeathIndex / this.suddenDeathPath.length) * 1000) / 10
            : 0,
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
      players: ([1, 2] as const).map((id) => {
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
          alive: player.alive,
          bombsAvailable: player.maxBombs - player.activeBombs,
          bombCapacity: player.maxBombs,
          flameRange: player.flameRange,
          speedLevel: player.speedLevel,
          spawnProtectionMs: Math.round(player.spawnProtectionMs),
        };
      }),
      bombs: this.bombs.map((bomb) => ({
        ownerId: bomb.ownerId,
        tile: bomb.tile,
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




