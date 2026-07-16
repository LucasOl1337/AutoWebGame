import type { FrontendIntent } from "../FrontendKernel/frontend-kernel";
import type { ContinuousRoomSessionSnapshot } from "./continuous-room-session-machine";

export function renderContinuousRoomSession(snapshot: ContinuousRoomSessionSnapshot): string {
  const authority = snapshot.authority;
  const remainingMs = authority?.preparationDeadlineMs ? Math.max(0, authority.preparationDeadlineMs - Date.now()) : 0;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const participants = authority?.participants.map((participant) => `
    <li class="continuous-room__participant" data-kind="${participant.kind}">
      <span>Vaga ${participant.playerId}</span>
      <strong>${escapeHtml(participant.displayName)}</strong>
      <small>${participant.kind === "completer" ? "BOT DA SALA · Completer" : "Humano"}</small>
    </li>`).join("") ?? "";
  const lastFrame = authority?.round.snapshots.at(-1);
  const arena = lastFrame ? renderArena(lastFrame.players) : "";
  const winner = authority?.round.winnerPlayerId
    ? authority.participants.find((participant) => participant.playerId === authority.round.winnerPlayerId)?.displayName ?? `Vaga ${authority.round.winnerPlayerId}`
    : "Empate";
  return `
    <main class="continuous-room" aria-labelledby="continuous-room-title" aria-busy="${snapshot.status === "recovering" || snapshot.status === "round"}">
      <header class="continuous-room__header">
        <div><p>Sala contínua / canário público</p><h1 id="continuous-room-title">Cidadela Arcana r1</h1></div>
        <span>rev ${authority?.serverRevision ?? "—"}</span>
      </header>
      <section class="continuous-room__status" role="status" aria-live="polite" tabindex="-1">
        <strong>${escapeHtml(snapshot.label)}</strong>
        ${snapshot.status === "preparing" ? `<span>Deadline autoritativo: ${seconds}s</span>` : ""}
        ${snapshot.errorMessage ? `<p>${escapeHtml(snapshot.errorMessage)}</p>` : ""}
      </section>
      <div class="continuous-room__layout">
        <section aria-labelledby="continuous-room-composition"><h2 id="continuous-room-composition">4 Vagas fixas</h2><ul>${participants}</ul><p>Ivo · Completer em reserva</p></section>
        <section aria-labelledby="continuous-room-arena"><h2 id="continuous-room-arena">Rodada</h2>${arena || '<div class="continuous-room__arena continuous-room__arena--pending">Pré-carregada · 11×9 inteira</div>'}</section>
      </div>
      ${snapshot.status === "result" ? `<section class="continuous-room__result"><h2>Resultado</h2><strong>${escapeHtml(winner)}</strong><p>${authority?.round.steps ?? 0} ticks · prova ${escapeHtml(authority?.round.receiptHash?.slice(0, 20) ?? "indisponível")}</p></section>` : ""}
      <nav class="continuous-room__actions" aria-label="Ações da Sala">
        ${(snapshot.status === "preparing" || snapshot.status === "round") ? '<button type="button" data-room-input="right">Mover à direita</button><button type="button" data-room-input="bomb">Bombar</button>' : ""}
        ${snapshot.status === "failed" ? '<button type="button" data-room-action="retry">Tentar novamente</button>' : ""}
        ${snapshot.status === "result" || snapshot.status === "cancelled"
          ? '<a href="/">Voltar ao Launcher</a>'
          : '<button type="button" data-room-action="leave">Sair da sala</button>'}
      </nav>
    </main>`;
}

export function continuousRoomClickIntent(button: HTMLButtonElement): FrontendIntent | null {
  if (button.dataset.roomAction === "retry") return { type: "continuous-room-retry" };
  if (button.dataset.roomAction === "leave") return { type: "continuous-room-leave" };
  if (button.dataset.roomInput === "right") return { type: "continuous-room-input", input: neutral({ direction: "right" }) };
  if (button.dataset.roomInput === "bomb") return { type: "continuous-room-input", input: neutral({ bombPressed: true }) };
  return null;
}

function neutral(overrides: Partial<ReturnType<typeof neutralInput>>) { return { ...neutralInput(), ...overrides }; }
function neutralInput() { return { direction: null as "right" | null, bombPressed: false, detonatePressed: false, skillPressed: false, skillHeld: false }; }

function renderArena(players: Readonly<Record<string, Readonly<{ alive: boolean; x: number; y: number }>>>): string {
  const cells = Array.from({ length: 99 }, (_, index) => {
    const x = index % 11;
    const y = Math.floor(index / 11);
    const player = Object.entries(players).find(([, state]) => state.x === x && state.y === y);
    return `<span${player ? ` data-player="${player[0]}" data-alive="${player[1].alive}"` : ""}></span>`;
  }).join("");
  return `<div class="continuous-room__arena" role="img" aria-label="Arena 11 por 9 inteira; posições da última Snapshot">${cells}</div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
