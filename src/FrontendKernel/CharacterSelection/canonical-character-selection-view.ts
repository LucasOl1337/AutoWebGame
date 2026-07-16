import type {
  CharacterSelectionIntent,
  CharacterSelectionSnapshot,
} from "./selection-contract";
import "./canonical-character-selection.css";

export function renderCanonicalCharacterSelection(snapshot: CharacterSelectionSnapshot): string {
  const pending = snapshot.status === "pending";
  const cards = snapshot.roster.map((character, index) => {
    const selected = character.id === snapshot.selectedCharacterId;
    return `
      <button
        class="canonical-selection__character${selected ? " canonical-selection__character--selected" : ""}"
        type="button"
        role="radio"
        aria-checked="${selected}"
        tabindex="${selected ? "0" : "-1"}"
        data-selection-character="${escapeHtml(character.id)}"
        ${pending ? "disabled" : ""}
      >
        <span class="canonical-selection__portrait" aria-hidden="true">
          <span class="canonical-selection__index">0${index + 1}</span>
          <img src="/Assets/Characters/Animations/${encodeURIComponent(character.id)}/idle-south-0.png" alt="" draggable="false">
        </span>
        <strong>${escapeHtml(character.name)}</strong>
        <span>${selected ? "Selecionado" : "Escolher"}</span>
      </button>
    `;
  }).join("");

  const message = snapshot.errorMessage ?? snapshot.validationMessage;
  const status = snapshot.operation?.label
    ?? (snapshot.status === "completed" ? "Destino confirmado." : "Escolha preservada neste dispositivo.");
  const primaryAction = snapshot.status === "error"
    ? `<button class="canonical-selection__primary" type="button" data-selection-intent="retry-selection">Tentar novamente</button>`
    : `<button class="canonical-selection__primary" type="button" data-selection-intent="confirm-selection" data-selection-confirm ${pending ? "disabled" : ""}>${escapeHtml(snapshot.actionLabel)} <span aria-hidden="true">→</span></button>`;

  return `
    <main class="canonical-selection" aria-labelledby="canonical-selection-title" aria-busy="${pending}">
      <header class="canonical-selection__topbar">
        <div class="canonical-selection__brand" aria-label="BOMBA PvP — Seleção de personagem">
          <span aria-hidden="true">BP / ${snapshot.journey === "continuous-room" ? "02" : "T2"}</span>
          <strong>BOMBA PvP</strong>
        </div>
        <button type="button" data-intent="navigate-back" data-selection-cancel-focus>${pending ? "Cancelar operação" : "Voltar ao Launcher"}</button>
      </header>

      <div class="canonical-selection__layout">
        <nav class="canonical-selection__rail" aria-label="Etapas da jornada">
          <span>01 / Launcher</span>
          <strong aria-current="step">02 / Seleção</strong>
          <span>03 / ${snapshot.journey === "continuous-room" ? "Entrada imediata" : "Treino"}</span>
        </nav>

        <section class="canonical-selection__content">
          <div class="canonical-selection__heading">
            <div>
              <p>Seleção de personagem / ${snapshot.journey === "continuous-room" ? "Sala contínua" : "Treino contra bots"}</p>
              <h1 id="canonical-selection-title" data-route-heading tabindex="-1">${escapeHtml(snapshot.title)}</h1>
            </div>
            <span>uma operação por vez</span>
          </div>

          <div class="canonical-selection__characters" role="radiogroup" aria-label="Personagens aprovados">
            ${cards}
          </div>

          <div class="canonical-selection__identity">
            <label for="selection-nick">Nick temporário</label>
            <input
              id="selection-nick"
              data-selection-nick
              type="text"
              minlength="3"
              maxlength="16"
              autocomplete="nickname"
              value="${escapeHtml(snapshot.nick)}"
              aria-invalid="${snapshot.validationMessage !== null}"
              ${message ? "aria-describedby=\"selection-message\"" : ""}
              ${pending ? "disabled" : ""}
            >
          </div>

          ${message ? `<div id="selection-message" class="canonical-selection__message" role="alert" tabindex="-1" data-selection-error><strong>O que não aconteceu</strong><span>${escapeHtml(message)}</span></div>` : ""}

          <div class="canonical-selection__actions">
            <p role="status" aria-live="polite">${escapeHtml(status)}</p>
            ${primaryAction}
          </div>
        </section>

        <aside class="canonical-selection__context" aria-label="Resumo da escolha">
          <p>Destino</p>
          <strong>${snapshot.journey === "continuous-room" ? "Sala contínua" : "Treino contra bots"}</strong>
          <span>${snapshot.journey === "continuous-room" ? "Procurar, entrar ou criar sem lobby manual." : "Rodada local, sem Fila da sala ou Ranking."}</span>
          <hr>
          <p>Escolha atual</p>
          <strong>${escapeHtml(snapshot.roster.find((character) => character.id === snapshot.selectedCharacterId)?.name ?? "Personagem")}</strong>
          <span>Nick: ${escapeHtml(snapshot.nick)}</span>
        </aside>
      </div>
    </main>
  `;
}

export function characterSelectionClickIntent(button: HTMLButtonElement): CharacterSelectionIntent | null {
  const characterId = button.dataset.selectionCharacter;
  if (characterId) return { type: "choose-character", characterId };
  const type = button.dataset.selectionIntent;
  if (type === "confirm-selection" || type === "retry-selection" || type === "cancel-selection") {
    return { type };
  }
  return null;
}

export function characterSelectionInputIntent(input: HTMLInputElement): CharacterSelectionIntent | null {
  return input.hasAttribute("data-selection-nick")
    ? { type: "edit-selection-nick", value: input.value }
    : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
