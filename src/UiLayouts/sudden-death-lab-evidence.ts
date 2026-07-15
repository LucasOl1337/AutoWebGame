export const SUDDEN_DEATH_LAB_EVIDENCE = Object.freeze({
  scenario: "transient tile before safe sudden-death destination",
  sampleSize: 3,
  route: Object.freeze({
    start: "(3,2)",
    transit: "(2,2)",
    destination: "(2,3)",
    closingTileEtaMs: 850,
  }),
  before: Object.freeze({
    source: "baseline capturada antes da correção",
    survivalCount: 0,
    deathAtMs: 2117,
    initialDirection: null,
  }),
  after: Object.freeze({
    source: "política atual verificada pelo teste comportamental",
    survivalCount: 3,
    observedForMs: 3000,
    destinationReachedAtMs: 300,
    initialDirection: "left",
  }),
});
