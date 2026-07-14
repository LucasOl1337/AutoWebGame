/* PROTOTYPE THROWAWAY — Issue #7: three radically different launcher compositions on the existing /game route. */
import "./prototype-ux.css";

type Variant = "A" | "B" | "C";
type Destination = "launcher" | "pvp" | "bots" | "lab";

const variants: Variant[] = ["A", "B", "C"];
const variantNames: Record<Variant, string> = { A: "iOS Focus", B: "BOMBA Broadcast", C: "Tactical Lab" };
const destinations: Array<{ id: Destination; label: string }> = [
  { id: "launcher", label: "Início" }, { id: "pvp", label: "PvP" }, { id: "bots", label: "Bots" }, { id: "lab", label: "Lab" },
];
const copy: Record<Destination, { eyebrow: string; title: string; body: string; action: string }> = {
  launcher: { eyebrow: "Temporada zero · online", title: "Acenda o pavio.", body: "Escolha seu próximo confronto. Uma porta clara para competição, treino e experimentação.", action: "Jogar agora" },
  pvp: { eyebrow: "Arena ranqueada · 128 online", title: "PvP sem espera.", body: "Entre na fila, monte uma sala ou retome a rivalidade. Dados demonstrativos, nenhuma ação é enviada.", action: "Buscar partida" },
  bots: { eyebrow: "Treino adaptativo · local", title: "Bots que revidam.", body: "Ajuste a pressão e ensaie rotas contra esquadrões simulados antes de entrar na arena.", action: "Montar treino" },
  lab: { eyebrow: "BOMBA Lab · experimental", title: "Quebre as regras.", body: "Teste arenas, modificadores e combinações em um espaço explicitamente experimental.", action: "Abrir bancada" },
};

function getVariant(): Variant { const value = new URLSearchParams(location.search).get("variant")?.toUpperCase(); return variants.includes(value as Variant) ? value as Variant : "A"; }
function getDestination(): Destination { const hash = location.hash.replace("#", ""); return destinations.some(({ id }) => id === hash) ? hash as Destination : "launcher"; }
function setVariant(next: Variant): void { const url = new URL(location.href); url.searchParams.set("variant", next); history.replaceState(null, "", url); render(); }
function setDestination(next: Destination): void { history.replaceState(null, "", `${location.pathname}${location.search}#${next}`); render(); }
function nav(active: Destination): string { return `<nav class="uxp__nav" aria-label="Destinos">${destinations.map(({id,label}) => `<button type="button" data-destination="${id}" ${id === active ? 'aria-current="page"' : ""}>${label}</button>`).join("")}</nav>`; }
function brand(): string { return `<div class="uxp__brand"><span class="uxp__bomb"></span><span>BOMBA</span></div>`; }
function modeButtons(): string { return destinations.slice(1).map(({id,label}, index) => `<button class="uxp__mode" data-destination="${id}"><span>0${index + 1} · destino</span><b>${label}</b><span>${id === "pvp" ? "Competição ao vivo" : id === "bots" ? "Treino calibrável" : "Regras experimentais"}</span></button>`).join(""); }

function variantA(active: Destination): string { const c = copy[active]; return `<header class="uxp__top">${brand()}${nav(active)}</header><main class="uxp__screen"><section class="uxp__hello"><div><span class="uxp__tag">Mock read-only</span><p class="uxp__eyebrow">${c.eyebrow}</p><h1>${c.title}</h1><p class="uxp__lead">${c.body}</p><button class="uxp__cta" aria-disabled="true">${c.action} →</button></div><aside class="uxp__status"><span class="uxp__eyebrow">Seu pulso hoje</span><big>2 vitórias</big><p>Próxima recompensa em 340 XP</p><small>FILA MÉDIA · 00:24</small></aside></section><section class="uxp__modes">${modeButtons()}</section></main>`; }
function variantB(active: Destination): string { const c = copy[active]; return `<header class="uxp__top">${brand()}<span class="uxp__live">● AO VIVO · 128</span>${nav(active)}</header><main class="uxp__screen"><section><p class="uxp__eyebrow">${c.eyebrow}</p><h1>${c.title.replace(" ", "<br><em>").replace(".", ".</em>")}</h1><p class="uxp__lead">${c.body}</p><p><button class="uxp__cta" aria-disabled="true">${c.action} ↗</button></p></section><aside class="uxp__rail">${destinations.slice(1).map(({id,label},i)=>`<button data-destination="${id}"><span>SET / 0${i+1}</span><b>${label}</b><small>${id === active ? "SELECIONADO" : "ABRIR DESTINO"}</small></button>`).join("")}</aside></main>`; }
function variantC(active: Destination): string { const c = copy[active]; return `<header class="uxp__top">${brand()}${nav(active)}</header><main class="uxp__screen"><aside class="uxp__side"><b>SISTEMA // READY</b><div class="uxp__meter">SERVIDORES <i style="width:92%"></i></div><div class="uxp__meter">INTENSIDADE <i style="width:68%"></i></div><p>BUILD: UX-07<br>REGIÃO: SA-EAST<br>LATÊNCIA: 18MS</p></aside><section class="uxp__panel"><span class="uxp__tag">READ_ONLY = TRUE</span><p class="uxp__eyebrow">${c.eyebrow}</p><h1>${c.title}</h1><p class="uxp__lead">${c.body}</p><div class="uxp__matrix">${destinations.slice(1).map(({id,label},i)=>`<button data-destination="${id}"><b>[0${i+1}] ${label.toUpperCase()}</b><span>${id === active ? "> EM FOCO" : "> INSPECIONAR"}</span></button>`).join("")}</div></section></main>`; }

function render(): void {
  const root = document.querySelector<HTMLDivElement>("#app"); if (!root) return;
  const variant = getVariant(); const active = getDestination();
  const body = variant === "A" ? variantA(active) : variant === "B" ? variantB(active) : variantC(active);
  root.innerHTML = `<div class="uxp uxp--${variant}">${body}<div class="uxp__switcher" role="group" aria-label="Alternar protótipo"><button data-cycle="-1" aria-label="Variante anterior">←</button><strong>${variant} — ${variantNames[variant]}</strong><button data-cycle="1" aria-label="Próxima variante">→</button></div></div>`;
  root.querySelectorAll<HTMLElement>("[data-destination]").forEach(el => el.addEventListener("click", () => setDestination(el.dataset.destination as Destination)));
  root.querySelectorAll<HTMLElement>("[data-cycle]").forEach(el => el.addEventListener("click", () => cycle(Number(el.dataset.cycle))));
}
function cycle(direction: number): void { const current = variants.indexOf(getVariant()); setVariant(variants[(current + direction + variants.length) % variants.length]); }

window.addEventListener("keydown", event => {
  if (event.target instanceof HTMLElement && (event.target.matches("input,textarea,[contenteditable=true]"))) return;
  if (event.key === "ArrowLeft") cycle(-1); if (event.key === "ArrowRight") cycle(1);
});
window.addEventListener("hashchange", render);
render();
