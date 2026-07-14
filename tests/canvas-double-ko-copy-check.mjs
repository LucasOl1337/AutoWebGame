import { SITE_COPY } from "../output/esm/UiLayouts/i18n.js";

const checks = {
  portugueseExplainsSimultaneousElimination:
    SITE_COPY.pt.canvas.doubleKo === "Eliminacao simultanea: os dois nucleos explodiram e ninguem pontua.",
  englishExplainsSimultaneousElimination:
    SITE_COPY.en.canvas.doubleKo === "Simultaneous elimination: both cores overloaded and no one scores.",
  portugueseNoPointsPreserved:
    SITE_COPY.pt.canvas.noPoints === "Nenhum ponto foi marcado.",
  englishNoPointsPreserved:
    SITE_COPY.en.canvas.noPoints === "No points awarded.",
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({ checks, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
