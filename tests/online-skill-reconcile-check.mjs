Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};

const { GameApp } = await import("../output/esm/app/game-app.js");
const { TILE_SIZE } = await import("../output/esm/core/config.js");

const NICO_ID = "5474c45c-2987-43e0-af2c-a6500c836881";
const emptyDirectionalSprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  idle: { up: [], down: [], left: [], right: [] },
  walk: { up: [], down: [], left: [], right: [] },
  run: { up: [], down: [], left: [], right: [] },
  cast: { up: [], down: [], left: [], right: [] },
  attack: { up: [], down: [], left: [], right: [] },
  death: { up: [], down: [], left: [], right: [] },
};

const root = { appendChild: noop };
const assets = {
  players: { 1: emptyDirectionalSprites, 2: emptyDirectionalSprites },
  characterRoster: [
    { id: "03a976fb-7313-4064-a477-5bb9b0760034", name: "Ranni", size: null, sprites: emptyDirectionalSprites, defaultSlot: 1 },
    { id: "6ee8baa5-3277-413b-ae0e-2659b9cc52e9", name: "Killer Bee", size: null, sprites: emptyDirectionalSprites, defaultSlot: 2 },
    { id: NICO_ID, name: "Nico", size: null, sprites: emptyDirectionalSprites, defaultSlot: 3 },
    { id: "d083c3dc-7162-4391-8628-6adde0b8d8d6", name: "Crocodilo Arcano", size: null, sprites: emptyDirectionalSprites },
  ],
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: {
    "bomb-up": null,
    "flame-up": null,
    "speed-up": null,
    "remote-up": null,
    "shield-up": null,
    "bomb-pass-up": null,
    "kick-up": null,
  },
};

function createServerMatch(characterSelections) {
  const game = new GameApp(root, assets);
  game.startServerAuthoritativeMatch([1, 2], characterSelections);
  game.arena.solid.clear();
  game.arena.breakable.clear();
  game.bombs = [];
  return game;
}

function createGuestMatch(characterSelections) {
  const game = new GameApp(root, assets);
  game.attachOnlineSession({
    role: "guest",
    roomCode: "room",
    sendGuestInput: () => undefined,
    sendHostSnapshot: () => undefined,
    sendMatchResultChoice: () => undefined,
  });
  game.startOnlineMatch({
    roomCode: "room",
    role: "guest",
    localPlayerId: 1,
    activePlayerIds: [1, 2],
    characterSelections,
  });
  return game;
}

function cloneSnapshotWithAck(snapshot, ackSeq) {
  return {
    ...snapshot,
    ackedInputSeq: { 1: ackSeq, 2: 0, 3: 0, 4: 0 },
    players: {
      1: {
        ...snapshot.players[1],
        tile: { ...snapshot.players[1].tile },
        position: { ...snapshot.players[1].position },
        velocity: { ...snapshot.players[1].velocity },
        skill: {
          ...snapshot.players[1].skill,
          projectedPosition: snapshot.players[1].skill.projectedPosition
            ? { ...snapshot.players[1].skill.projectedPosition }
            : null,
        },
      },
      2: {
        ...snapshot.players[2],
        tile: { ...snapshot.players[2].tile },
        position: { ...snapshot.players[2].position },
        velocity: { ...snapshot.players[2].velocity },
        skill: {
          ...snapshot.players[2].skill,
          projectedPosition: snapshot.players[2].skill.projectedPosition
            ? { ...snapshot.players[2].skill.projectedPosition }
            : null,
        },
      },
      3: snapshot.players[3],
      4: snapshot.players[4],
    },
  };
}

const neutralInput = {
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
};

const ranniServer = createServerMatch({ 1: 0, 2: 1, 3: 0, 4: 1 });
const ranni = ranniServer.players[1];
ranni.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
ranni.tile = { x: 4, y: 4 };
ranni.spawnProtectionMs = 0;
ranniServer.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
});
ranniServer.advanceServerSimulation(17);
ranniServer.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
});
ranniServer.advanceServerSimulation(17);
const ranniSnapshot = cloneSnapshotWithAck(ranniServer.exportOnlineSnapshot(), 0);

const ranniGuest = createGuestMatch({ 1: 0, 2: 1, 3: 0, 4: 1 });
ranniGuest.onlinePendingInputs = [
  {
    seq: 1,
    input: {
      direction: "right",
      ...neutralInput,
      skillPressed: true,
    },
  },
];
ranniGuest.applyOnlineSnapshot(ranniSnapshot);
const ranniStillChanneling = ranniGuest.players[1].skill.phase === "channeling";

const beeServer = createServerMatch({ 1: 1, 2: 0, 3: 1, 4: 0 });
const bee = beeServer.players[1];
bee.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
bee.tile = { x: 4, y: 4 };
bee.spawnProtectionMs = 0;
beeServer.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
});
beeServer.advanceServerSimulation(17);
beeServer.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
});
beeServer.advanceServerSimulation(17);
const beeSnapshot = cloneSnapshotWithAck(beeServer.exportOnlineSnapshot(), 0);

const beeGuest = createGuestMatch({ 1: 1, 2: 0, 3: 1, 4: 0 });
beeGuest.onlinePendingInputs = [
  {
    seq: 1,
    input: {
      direction: "right",
      ...neutralInput,
      skillPressed: true,
    },
  },
];
beeGuest.applyOnlineSnapshot(beeSnapshot);
const beeStillChanneling = beeGuest.players[1].skill.phase === "channeling";

const nicoServer = createServerMatch({ 1: 2, 2: 0, 3: 2, 4: 0 });
const nico = nicoServer.players[1];
nico.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
nico.tile = { x: 4, y: 4 };
nico.spawnProtectionMs = 0;
nicoServer.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
  skillHeld: true,
});
nicoServer.advanceServerSimulation(17);
nicoServer.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillHeld: true,
});
nicoServer.advanceServerSimulation(17);
const nicoSnapshot = cloneSnapshotWithAck(nicoServer.exportOnlineSnapshot(), 0);

const nicoGuest = createGuestMatch({ 1: 2, 2: 0, 3: 2, 4: 0 });
nicoGuest.onlinePendingInputs = [
  {
    seq: 1,
    input: {
      direction: "right",
      ...neutralInput,
      skillPressed: true,
      skillHeld: true,
    },
  },
  {
    seq: 2,
    input: {
      direction: "right",
      ...neutralInput,
      skillHeld: true,
    },
  },
];
nicoGuest.applyOnlineSnapshot(nicoSnapshot);
const nicoStillChanneling = nicoGuest.players[1].skill.phase === "channeling";

const crocodiloServer = createServerMatch({ 1: 3, 2: 0, 3: 3, 4: 0 });
const crocodilo = crocodiloServer.players[1];
crocodilo.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
crocodilo.tile = { x: 4, y: 4 };
crocodilo.spawnProtectionMs = 0;
crocodiloServer.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
  skillHeld: true,
});
crocodiloServer.advanceServerSimulation(17);
crocodiloServer.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillHeld: true,
});
crocodiloServer.advanceServerSimulation(17);
const crocodiloSnapshot = cloneSnapshotWithAck(crocodiloServer.exportOnlineSnapshot(), 0);

const crocodiloGuest = createGuestMatch({ 1: 3, 2: 0, 3: 3, 4: 0 });
crocodiloGuest.onlinePendingInputs = [
  {
    seq: 1,
    input: {
      direction: "right",
      ...neutralInput,
      skillPressed: true,
      skillHeld: true,
    },
  },
];
crocodiloGuest.applyOnlineSnapshot(crocodiloSnapshot);
const crocodiloStillChanneling = crocodiloGuest.players[1].skill.phase === "channeling";

const report = {
  ranniSnapshotSkill: ranniSnapshot.players[1].skill,
  ranniGuestSkill: ranniGuest.players[1].skill,
  ranniStillChanneling,
  beeSnapshotSkill: beeSnapshot.players[1].skill,
  beeGuestSkill: beeGuest.players[1].skill,
  beeStillChanneling,
  nicoSnapshotSkill: nicoSnapshot.players[1].skill,
  nicoGuestSkill: nicoGuest.players[1].skill,
  nicoStillChanneling,
  crocodiloSnapshotSkill: crocodiloSnapshot.players[1].skill,
  crocodiloGuestSkill: crocodiloGuest.players[1].skill,
  crocodiloStillChanneling,
  pass: ranniStillChanneling && beeStillChanneling && nicoStillChanneling && crocodiloStillChanneling,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
