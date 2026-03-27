import type { CharacterRosterEntry } from "../app/assets";
import { assetUrl } from "../app/asset-url";
import { ALL_PLAYER_IDS } from "../core/types";
import type { PlayerId } from "../core/types";
import type {
  ChatEntry,
  LobbyState,
  LobbySummary,
  OnlineGameFrame,
  MatchStartConfig,
  OnlineGameSnapshot,
  OnlineInputState,
  OnlineRole,
  OnlineSessionBridge,
  ServerMessage,
} from "./protocol";

interface OnlineGameAppBridge {
  attachOnlineSession(session: OnlineSessionBridge): void;
  detachOnlineSession(): void;
  startOnlineMatch(config: MatchStartConfig): void;
  applyOnlineFrame(frame: OnlineGameFrame): void;
  applyOnlineSnapshot(snapshot: OnlineGameSnapshot): void;
  clearOnlinePeer(): void;
  receiveOnlineGuestInput(input: OnlineInputState): void;
}

interface SessionElements {
  shell: HTMLDivElement;
  browserList: HTMLDivElement;
  createTitle: HTMLInputElement;
  createButton: HTMLButtonElement;
  quickMatchButton: HTMLButtonElement;
  quickMatchMeta: HTMLParagraphElement;
  selectorPortrait: HTMLImageElement;
  selectorName: HTMLParagraphElement;
  selectorNote: HTMLParagraphElement;
  selectorPrev: HTMLButtonElement;
  selectorNext: HTMLButtonElement;
  stageEyebrow: HTMLParagraphElement;
  stageTitle: HTMLHeadingElement;
  stageDescription: HTMLParagraphElement;
  stageMeta: HTMLParagraphElement;
  inviteInput: HTMLInputElement;
  copyButton: HTMLButtonElement;
  leaveButton: HTMLButtonElement;
  arenaViewport: HTMLDivElement;
  seats: Record<PlayerId, HTMLDivElement>;
  chatLog: HTMLDivElement;
  chatInput: HTMLInputElement;
  chatSend: HTMLButtonElement;
  status: HTMLParagraphElement;
}

const LOBBY_MAX_PLAYERS = 4;

export class OnlineSessionClient implements OnlineSessionBridge {
  public role: OnlineRole | null = null;
  public roomCode: string | null = null;

  private readonly app: OnlineGameAppBridge;
  private readonly roster: CharacterRosterEntry[];
  private readonly elements: SessionElements;
  private readonly canvasObserver: MutationObserver;
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private clientId: string | null = null;
  private lobbies: LobbySummary[] = [];
  private currentLobby: LobbyState | null = null;
  private pendingAutoJoinRoom: string | null;
  private reconnectAttempts = 0;
  private quickMatchSearching = false;
  private quickMatchQueuedCount = 0;
  private quickMatchCountdownMs: number | null = null;
  private preferredCharacterIndex = 0;

  constructor(root: HTMLElement, app: OnlineGameAppBridge, roster: CharacterRosterEntry[]) {
    this.app = app;
    this.roster = roster;
    this.pendingAutoJoinRoom = this.readRoomFromLocation();
    this.preferredCharacterIndex = this.readPreferredCharacterIndex();
    this.elements = this.render(root);
    this.canvasObserver = new MutationObserver(() => this.mountCanvas(root));
    this.canvasObserver.observe(root, { childList: true });
    this.mountCanvas(root);
    this.bindEvents();
    this.renderCharacterSelector();
    this.renderQuickMatchState();
    this.renderLobbyList();
    this.renderStage();
    this.setStatus("Connecting to global lobby...");
    this.connect();
  }

  public sendGuestInput(input: OnlineInputState, inputSeq: number): void {
    if (this.role !== "guest") {
      return;
    }
    this.send({ type: "guest-input", input, inputSeq, sentAtMs: Date.now() });
  }

  public sendHostSnapshot(snapshot: OnlineGameSnapshot): void {
    if (this.role !== "host") {
      return;
    }
    this.send({ type: "host-snapshot", snapshot });
  }

  private connect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/online`);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      if (this.currentLobby?.roomCode) {
        this.pendingAutoJoinRoom = this.currentLobby.roomCode;
      }
    });
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("close", () => {
      this.socket = null;
      this.role = null;
      this.roomCode = null;
      this.app.detachOnlineSession();
      this.setStatus("Connection lost. Reconnecting to live lobby...");
      this.scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      this.setStatus("Connection error. Retrying...");
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }
    const delayMs = Math.min(2500, 400 + this.reconnectAttempts * 300);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  private bindEvents(): void {
    this.elements.createButton.addEventListener("click", () => {
      const title = this.elements.createTitle.value.trim() || "Open Arena";
      this.send({ type: "create-lobby", title });
    });

    this.elements.quickMatchButton.addEventListener("click", () => {
      this.send(
        this.quickMatchSearching
          ? { type: "quick-match-cancel" }
          : { type: "quick-match", characterIndex: this.preferredCharacterIndex },
      );
    });

    this.elements.selectorPrev.addEventListener("click", () => {
      this.updatePreferredCharacter(this.preferredCharacterIndex - 1);
    });

    this.elements.selectorNext.addEventListener("click", () => {
      this.updatePreferredCharacter(this.preferredCharacterIndex + 1);
    });

    this.elements.copyButton.addEventListener("click", async () => {
      if (!this.currentLobby) {
        return;
      }
      try {
        await navigator.clipboard.writeText(this.buildInviteUrl(this.currentLobby.roomCode));
        this.setStatus("Invite copied. Anyone can also join from the global lobby board.");
      } catch {
        this.setStatus("Copy failed. Share the room code manually.");
      }
    });

    this.elements.leaveButton.addEventListener("click", () => {
      this.send({ type: "leave-lobby" });
    });

    this.elements.chatSend.addEventListener("click", () => {
      this.sendChat();
    });
    this.elements.chatInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        this.sendChat();
      }
    });
    this.elements.chatInput.addEventListener("keyup", (event) => {
      event.stopPropagation();
    });
    this.elements.chatInput.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    this.elements.chatInput.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  private sendChat(): void {
    if (!this.currentLobby) {
      this.setStatus("Join a room before sending chat.");
      return;
    }
    const body = this.elements.chatInput.value.trim();
    if (!body) {
      return;
    }
    if (!this.send({ type: "chat-send", body })) {
      this.setStatus("Chat temporarily unavailable. Reconnecting...");
      return;
    }
    this.elements.chatInput.value = "";
    this.elements.chatInput.focus();
  }

  private handleMessage(rawMessage: unknown): void {
    if (typeof rawMessage !== "string") {
      return;
    }

    let message: ServerMessage;
    try {
      message = JSON.parse(rawMessage) as ServerMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case "hello":
        this.clientId = message.clientId;
        this.lobbies = message.lobbies;
        this.quickMatchQueuedCount = message.quickMatchQueued;
        this.quickMatchSearching = message.searchingQuickMatch;
        this.quickMatchCountdownMs = null;
        this.syncPreferredCharacterFromLobby();
        this.renderCharacterSelector();
        this.renderLobbyList();
        this.renderQuickMatchState();
        this.renderStage();
        if (this.pendingAutoJoinRoom) {
          this.send({ type: "join-lobby", roomCode: this.pendingAutoJoinRoom });
          this.pendingAutoJoinRoom = null;
        }
        this.setStatus("Global lobby online. Create a room or enter an arena in the live board.");
        break;
      case "lobby-list":
        this.lobbies = message.lobbies;
        this.renderLobbyList();
        break;
      case "lobby-joined":
        this.role = message.role;
        this.currentLobby = message.lobby;
        this.roomCode = message.lobby.roomCode;
        this.syncPreferredCharacterFromLobby();
        this.renderCharacterSelector();
        this.app.attachOnlineSession(this);
        this.updateLocation(message.lobby.roomCode);
        this.renderStage();
        this.renderLobbyList();
        this.setStatus("Lobby joined. Claim a slot, pick a character, then lock ready.");
        break;
      case "lobby-updated":
        this.currentLobby = message.lobby;
        this.roomCode = message.lobby.roomCode;
        this.syncPreferredCharacterFromLobby();
        this.renderCharacterSelector();
        this.renderStage();
        this.renderLobbyList();
        break;
      case "lobby-left":
        this.role = null;
        this.roomCode = null;
        this.currentLobby = null;
        this.renderCharacterSelector();
        this.updateLocation(null);
        this.app.detachOnlineSession();
        this.renderStage();
        this.renderLobbyList();
        this.setStatus("Back in the global lobby.");
        break;
      case "match-started":
        this.role = message.config.role;
        this.roomCode = message.config.roomCode;
        this.syncPreferredCharacterFromMatchConfig(message.config);
        this.renderCharacterSelector();
        this.app.startOnlineMatch(message.config);
        this.elements.shell.dataset.state = "match";
        this.renderStage();
        this.setStatus("Match live. Slot locks are active until the room resets.");
        break;
      case "guest-input":
        this.app.receiveOnlineGuestInput(message.input);
        break;
      case "host-snapshot":
        this.app.applyOnlineSnapshot(message.snapshot);
        break;
      case "host-frame":
        this.app.applyOnlineFrame(message.frame);
        break;
      case "chat-message":
        if (this.currentLobby && this.currentLobby.roomCode === message.roomCode) {
          this.currentLobby.chat = [...this.currentLobby.chat, message.entry].slice(-40);
          this.renderChat();
        }
        break;
      case "quick-match-state":
        this.quickMatchQueuedCount = message.queued;
        this.quickMatchSearching = message.searching;
        this.quickMatchCountdownMs = message.countdownMs;
        this.renderQuickMatchState();
        break;
      case "peer-left":
        this.app.clearOnlinePeer();
        this.elements.shell.dataset.state = "lobby";
        this.setStatus("A pilot left. The room is open again.");
        break;
      case "error":
        this.setStatus(message.message);
        break;
      default:
        break;
    }
  }

  private render(root: HTMLElement): SessionElements {
    const shell = document.createElement("div");
    shell.className = "lobby-shell";
    shell.dataset.state = "browse";

    const browser = document.createElement("aside");
    browser.className = "lobby-browser";

    const brand = document.createElement("div");
    brand.className = "lobby-brand";
    brand.innerHTML = `
      <p>Global lobby</p>
      <h1>Mistbridge Arena</h1>
      <span>Public rooms. Up to 4 pilots. Quick match fills from 2 to 4.</span>
    `;

    const createPanel = document.createElement("div");
    createPanel.className = "lobby-create";

    const createTitle = document.createElement("input");
    createTitle.className = "lobby-create__input";
    createTitle.type = "text";
    createTitle.placeholder = "Lobby name";
    createTitle.maxLength = 36;
    createTitle.name = "lobby-name";
    createTitle.autocomplete = "off";
    createTitle.setAttribute("aria-label", "Lobby name");

    const createButton = document.createElement("button");
    createButton.className = "lobby-button lobby-button--primary";
    createButton.type = "button";
    createButton.textContent = "Create lobby";

    const quickMatchButton = document.createElement("button");
    quickMatchButton.className = "lobby-button lobby-button--quickmatch";
    quickMatchButton.type = "button";
    quickMatchButton.textContent = "Find quick match";

    const quickMatchMeta = document.createElement("p");
    quickMatchMeta.className = "lobby-quickmatch-meta";

    createPanel.append(createTitle, createButton, quickMatchButton, quickMatchMeta);

    const selectorPanel = document.createElement("section");
    selectorPanel.className = "lobby-selector";

    const selectorHeading = document.createElement("div");
    selectorHeading.className = "lobby-selector__heading";
    selectorHeading.textContent = "Selected pilot";

    const selectorPortrait = document.createElement("img");
    selectorPortrait.className = "lobby-selector__portrait";
    selectorPortrait.alt = "Selected character";
    selectorPortrait.width = 112;
    selectorPortrait.height = 112;

    const selectorName = document.createElement("p");
    selectorName.className = "lobby-selector__name";

    const selectorNote = document.createElement("p");
    selectorNote.className = "lobby-selector__note";

    const selectorActions = document.createElement("div");
    selectorActions.className = "lobby-selector__actions";

    const selectorPrev = document.createElement("button");
    selectorPrev.className = "lobby-button";
    selectorPrev.type = "button";
    selectorPrev.textContent = "Prev";

    const selectorNext = document.createElement("button");
    selectorNext.className = "lobby-button";
    selectorNext.type = "button";
    selectorNext.textContent = "Next";

    selectorActions.append(selectorPrev, selectorNext);
    selectorPanel.append(selectorHeading, selectorPortrait, selectorName, selectorNote, selectorActions);

    const browserList = document.createElement("div");
    browserList.className = "lobby-browser__list";

    browser.append(brand, createPanel, selectorPanel, browserList);

    const stage = document.createElement("section");
    stage.className = "lobby-stage";

    const stageTop = document.createElement("div");
    stageTop.className = "lobby-stage__top";

    const stageIntro = document.createElement("div");
    stageIntro.className = "lobby-stage__intro";

    const stageEyebrow = document.createElement("p");
    stageEyebrow.className = "lobby-stage__eyebrow";

    const stageTitle = document.createElement("h2");
    stageTitle.className = "lobby-stage__title";

    const stageDescription = document.createElement("p");
    stageDescription.className = "lobby-stage__description";

    const stageMeta = document.createElement("p");
    stageMeta.className = "lobby-stage__meta";

    stageIntro.append(stageEyebrow, stageTitle, stageDescription, stageMeta);

    const inviteRow = document.createElement("div");
    inviteRow.className = "lobby-stage__invite";

    const inviteInput = document.createElement("input");
    inviteInput.className = "lobby-stage__invite-input";
    inviteInput.type = "text";
    inviteInput.readOnly = true;
    inviteInput.placeholder = "Invite URL";
    inviteInput.name = "invite-url";
    inviteInput.autocomplete = "off";
    inviteInput.setAttribute("aria-label", "Invite URL");

    const copyButton = document.createElement("button");
    copyButton.className = "lobby-button";
    copyButton.type = "button";
    copyButton.textContent = "Copy invite";

    const leaveButton = document.createElement("button");
    leaveButton.className = "lobby-button lobby-button--danger";
    leaveButton.type = "button";
    leaveButton.textContent = "Leave lobby";

    inviteRow.append(inviteInput, copyButton, leaveButton);
    stageTop.append(stageIntro, inviteRow);

    const workspace = document.createElement("div");
    workspace.className = "lobby-stage__workspace";

    const arenaViewport = document.createElement("div");
    arenaViewport.className = "lobby-stage__viewport";

    const sideRail = document.createElement("aside");
    sideRail.className = "lobby-stage__rail";

    const seatsPanel = document.createElement("section");
    seatsPanel.className = "lobby-stage__panel lobby-stage__panel--seats";

    const seatsHeading = document.createElement("div");
    seatsHeading.className = "lobby-stage__panel-heading";
    seatsHeading.textContent = "Pilot locks";

    const seatsWrap = document.createElement("div");
    seatsWrap.className = "lobby-seats";

    const seats = {
      1: document.createElement("div"),
      2: document.createElement("div"),
      3: document.createElement("div"),
      4: document.createElement("div"),
    } as Record<PlayerId, HTMLDivElement>;
    for (const playerId of ALL_PLAYER_IDS) {
      seats[playerId].className = "lobby-seat";
      seatsWrap.append(seats[playerId]);
    }
    seatsPanel.append(seatsHeading, seatsWrap);

    const chatPanel = document.createElement("section");
    chatPanel.className = "lobby-chat lobby-stage__panel";

    const chatHeading = document.createElement("div");
    chatHeading.className = "lobby-stage__panel-heading";
    chatHeading.textContent = "Arena feed";

    const chatLog = document.createElement("div");
    chatLog.className = "lobby-chat__log";

    const chatInput = document.createElement("input");
    chatInput.className = "lobby-chat__input";
    chatInput.type = "text";
    chatInput.placeholder = "Type a message";
    chatInput.maxLength = 280;
    chatInput.name = "chat-message";
    chatInput.autocomplete = "off";
    chatInput.spellcheck = false;
    chatInput.autocapitalize = "off";
    chatInput.setAttribute("aria-label", "Type a message");

    const chatSend = document.createElement("button");
    chatSend.className = "lobby-button";
    chatSend.type = "button";
    chatSend.textContent = "Send";

    const chatComposer = document.createElement("div");
    chatComposer.className = "lobby-chat__composer";
    chatComposer.append(chatInput, chatSend);

    chatPanel.append(chatHeading, chatLog, chatComposer);

    const status = document.createElement("p");
    status.className = "lobby-status";

    sideRail.append(seatsPanel, chatPanel);
    workspace.append(arenaViewport, sideRail);
    stage.append(stageTop, workspace, status);
    shell.append(browser, stage);
    root.prepend(shell);

    return {
      shell,
      browserList,
      createTitle,
      createButton,
      quickMatchButton,
      quickMatchMeta,
      selectorPortrait,
      selectorName,
      selectorNote,
      selectorPrev,
      selectorNext,
      stageEyebrow,
      stageTitle,
      stageDescription,
      stageMeta,
      inviteInput,
      copyButton,
      leaveButton,
      arenaViewport,
      seats,
      chatLog,
      chatInput,
      chatSend,
      status,
    };
  }

  private renderLobbyList(): void {
    this.elements.browserList.replaceChildren();

    if (this.lobbies.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lobby-browser__empty";
      empty.textContent = "No live lobbies. Start the next arena.";
      this.elements.browserList.appendChild(empty);
      return;
    }

    for (const lobby of this.lobbies) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "lobby-card";
      if (this.currentLobby?.roomCode === lobby.roomCode) {
        card.dataset.active = "true";
      }

      const title = document.createElement("strong");
      title.textContent = lobby.title;

      const meta = document.createElement("span");
      meta.textContent = `${lobby.roomCode} | ${lobby.occupantCount}/${LOBBY_MAX_PLAYERS} pilots | ${lobby.status}`;

      const seatStrip = document.createElement("div");
      seatStrip.className = "lobby-card__seats";
      seatStrip.append(...ALL_PLAYER_IDS.map((playerId) => this.renderSeatPill(`P${playerId}`, lobby.seats[playerId])));

      card.append(title, meta, seatStrip);
      card.addEventListener("click", () => {
        if (this.currentLobby?.roomCode === lobby.roomCode) {
          return;
        }
        this.send({ type: "join-lobby", roomCode: lobby.roomCode });
      });

      this.elements.browserList.appendChild(card);
    }
  }

  private renderCharacterSelector(): void {
    const selected = this.getCharacter(this.preferredCharacterIndex);
    this.elements.selectorPortrait.src = assetUrl(`/assets/characters/${selected.id}/south.png`);
    this.elements.selectorName.textContent = selected.name;
    this.elements.selectorNote.textContent = this.currentLobby?.selfSeat
      ? "Applied to your claimed slot and reused for quick match."
      : "This pilot is used for quick match and your next claimed slot.";
  }

  private updatePreferredCharacter(nextIndex: number): void {
    this.preferredCharacterIndex = this.wrapCharacterIndex(nextIndex);
    this.persistPreferredCharacterIndex();
    this.renderCharacterSelector();

    if (this.quickMatchSearching) {
      this.send({ type: "quick-match", characterIndex: this.preferredCharacterIndex });
    }

    if (this.currentLobby?.selfSeat && this.currentLobby.status === "open") {
      this.send({ type: "set-character", characterIndex: this.preferredCharacterIndex });
    }
  }

  private syncPreferredCharacterFromLobby(): void {
    const selfSeat = this.currentLobby?.selfSeat;
    if (!selfSeat) {
      return;
    }
    const seat = this.currentLobby?.seats[selfSeat];
    if (!seat) {
      return;
    }
    this.preferredCharacterIndex = this.wrapCharacterIndex(seat.characterIndex);
    this.persistPreferredCharacterIndex();
  }

  private syncPreferredCharacterFromMatchConfig(config: MatchStartConfig): void {
    const selected = config.characterSelections[config.localPlayerId] ?? this.preferredCharacterIndex;
    this.preferredCharacterIndex = this.wrapCharacterIndex(selected);
    this.persistPreferredCharacterIndex();
  }

  private renderQuickMatchState(): void {
    this.elements.quickMatchButton.textContent = this.quickMatchSearching ? "Cancel search" : "Find quick match";
    this.elements.quickMatchButton.dataset.searching = this.quickMatchSearching ? "true" : "false";
    this.elements.quickMatchMeta.textContent = this.quickMatchSearching
      ? this.quickMatchQueuedCount >= 2 && this.quickMatchCountdownMs !== null
        ? `${this.quickMatchQueuedCount} pilots locked. Match starts in ${Math.max(1, Math.ceil(this.quickMatchCountdownMs / 1000))}s unless more join.`
        : "Searching for pilots..."
      : this.quickMatchQueuedCount > 0
        ? `${this.quickMatchQueuedCount} pilot${this.quickMatchQueuedCount === 1 ? "" : "s"} in quick-match queue`
        : "Jump into a live match as soon as two players queue. Up to four can enter the same match.";
  }

  private renderSeatPill(label: string, seat: LobbySummary["seats"][PlayerId]): HTMLElement {
    const pill = document.createElement("span");
    pill.className = "lobby-seat-pill";
    pill.dataset.ready = seat.ready ? "true" : "false";
    pill.textContent = `${label} ${seat.clientId ? "taken" : "open"}`;
    return pill;
  }

  private renderStage(): void {
    const lobby = this.currentLobby;
    if (!lobby) {
      this.elements.shell.dataset.state = "browse";
      this.elements.stageEyebrow.textContent = "Global matchmaking";
      this.elements.stageTitle.textContent = "Choose a room and step into the arena";
      this.elements.stageDescription.textContent =
        "Create a public lobby or join one from the live board. Once at least two occupied slots are ready, the match starts. Quick match waits 5 seconds at 2 pilots to let 3rd and 4th join.";
      this.elements.stageMeta.textContent = "Public rooms - Up to 4 pilots - Character select - Quick match fill window";
      this.elements.inviteInput.value = "";
      this.elements.copyButton.disabled = true;
      this.elements.leaveButton.disabled = true;
      for (const playerId of ALL_PLAYER_IDS) {
        this.elements.seats[playerId].replaceChildren(this.buildEmptySeat(playerId));
      }
      this.renderChat();
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
      return;
    }

    this.elements.shell.dataset.state = lobby.status === "playing" ? "match" : "lobby";
    this.elements.stageEyebrow.textContent = "Open arena";
    this.elements.stageTitle.textContent = lobby.title;
    this.elements.stageDescription.textContent = lobby.status === "playing"
      ? "Match in progress. The room stays locked until one of the pilots leaves."
      : "Claim a side, browse the roster, and lock your ready state. Any group of 2 to 4 occupied slots can launch once every occupied slot is ready.";
    this.elements.stageMeta.textContent =
      `${lobby.roomCode} - ${lobby.occupantCount}/${LOBBY_MAX_PLAYERS} pilots - ${lobby.status === "playing" ? "Live match" : "Waiting room"}`;
    this.elements.inviteInput.value = this.buildInviteUrl(lobby.roomCode);
    this.elements.copyButton.disabled = false;
    this.elements.leaveButton.disabled = false;
    for (const playerId of ALL_PLAYER_IDS) {
      this.elements.seats[playerId].replaceChildren(this.buildSeatContent(playerId, lobby));
    }
    this.renderChat();
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  private renderChat(): void {
    this.elements.chatLog.replaceChildren();
    const entries = this.currentLobby?.chat ?? [];
    const chatAvailable = Boolean(this.currentLobby);
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lobby-chat__empty";
      empty.textContent = this.currentLobby
        ? "No messages yet. Chat is live during lobby and match."
        : "Join a room or quick match to chat.";
      this.elements.chatLog.appendChild(empty);
      this.elements.chatInput.disabled = !chatAvailable;
      this.elements.chatSend.disabled = !chatAvailable;
      return;
    }

    for (const entry of entries) {
      this.elements.chatLog.appendChild(this.renderChatEntry(entry));
    }

    this.elements.chatInput.disabled = !chatAvailable;
    this.elements.chatSend.disabled = !chatAvailable;
    this.elements.chatLog.scrollTop = this.elements.chatLog.scrollHeight;
  }

  private renderChatEntry(entry: ChatEntry): HTMLElement {
    const item = document.createElement("div");
    item.className = "lobby-chat__entry";
    if (entry.system) {
      item.dataset.system = "true";
    } else if (entry.authorClientId && entry.authorClientId === this.clientId) {
      item.dataset.self = "true";
    }

    const meta = document.createElement("div");
    meta.className = "lobby-chat__meta";
    meta.textContent = `${entry.authorLabel} - ${new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const body = document.createElement("p");
    body.className = "lobby-chat__body";
    body.textContent = entry.body;

    item.append(meta, body);
    return item;
  }

  private buildEmptySeat(playerId: PlayerId): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "lobby-seat__content";

    const header = document.createElement("div");
    header.className = "lobby-seat__header";

    const slot = document.createElement("span");
    slot.textContent = `P${playerId}`;

    const title = document.createElement("strong");
    title.textContent = "Open slot";

    const state = document.createElement("em");
    state.textContent = "Waiting for a pilot";

    const placeholder = document.createElement("div");
    placeholder.className = "lobby-seat__placeholder";
    placeholder.textContent = "Claim this side, use the left roster panel, then lock ready.";

    header.append(slot, title, state);
    wrap.append(header, placeholder);
    return wrap;
  }

  private buildSeatContent(playerId: PlayerId, lobby: LobbyState): HTMLElement {
    const seat = lobby.seats[playerId];
    const isSelf = seat.clientId === lobby.selfClientId;
    const wrap = document.createElement("div");
    wrap.className = "lobby-seat__content";
    wrap.dataset.ready = seat.ready ? "true" : "false";
    wrap.dataset.self = isSelf ? "true" : "false";

    const header = document.createElement("div");
    header.className = "lobby-seat__header";

    const slotLabel = document.createElement("span");
    slotLabel.textContent = `P${playerId}`;

    const name = document.createElement("strong");
    name.textContent = seat.clientId ? seat.displayName || `Pilot ${playerId}` : "Open slot";

    const status = document.createElement("em");
    status.textContent = seat.clientId
      ? (seat.ready ? "Locked" : isSelf ? "Choosing" : "Waiting")
      : "Available";

    header.append(slotLabel, name, status);

    const preview = document.createElement("div");
    preview.className = "lobby-seat__preview";

    const character = this.getCharacter(seat.characterIndex);
    const image = document.createElement("img");
    image.className = "lobby-seat__portrait";
    image.alt = character.name;
    image.src = assetUrl(`/assets/characters/${character.id}/south.png`);
    image.width = 72;
    image.height = 72;

    const characterMeta = document.createElement("div");
    characterMeta.className = "lobby-seat__meta";

    const characterName = document.createElement("p");
    characterName.textContent = character.name;

    const characterState = document.createElement("span");
    characterState.textContent = seat.ready ? "Ready" : "Not ready";

    characterMeta.append(characterName, characterState);

    preview.append(image, characterMeta);

    const actions = document.createElement("div");
    actions.className = "lobby-seat__actions";

    if (!seat.clientId) {
      const claimButton = document.createElement("button");
      claimButton.className = "lobby-button lobby-button--primary";
      claimButton.type = "button";
      claimButton.textContent = `Claim P${playerId}`;
      claimButton.addEventListener("click", () => {
        this.send({ type: "claim-seat", seat: playerId, characterIndex: this.preferredCharacterIndex });
      });
      actions.appendChild(claimButton);
    } else if (isSelf && lobby.status === "open") {
      const readyButton = document.createElement("button");
      readyButton.className = `lobby-button ${seat.ready ? "lobby-button--danger" : "lobby-button--primary"}`;
      readyButton.type = "button";
      readyButton.textContent = seat.ready ? "Unlock" : "Lock ready";
      readyButton.addEventListener("click", () => {
        this.send({ type: "set-ready", ready: !seat.ready });
      });

      const info = document.createElement("span");
      info.className = "lobby-seat__hint";
      info.textContent = "Pilot selection is controlled from the left panel.";

      actions.append(readyButton, info);
    } else {
      const info = document.createElement("span");
      info.className = "lobby-seat__hint";
      info.textContent = seat.ready ? "Slot locked in." : "Waiting for this pilot.";
      actions.appendChild(info);
    }

    wrap.append(header, preview, actions);
    return wrap;
  }

  private mountCanvas(root: HTMLElement): void {
    const canvas = root.querySelector("canvas");
    if (!canvas || canvas.parentElement === this.elements.arenaViewport) {
      return;
    }
    this.elements.arenaViewport.replaceChildren(canvas);
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  private getCharacter(index: number): CharacterRosterEntry {
    const total = this.roster.length || 1;
    const safeIndex = ((index % total) + total) % total;
    return this.roster[safeIndex] ?? {
      id: "default-p1",
      name: "Pilot",
      size: null,
      sprites: {
        up: null,
        down: null,
        left: null,
        right: null,
        idle: { up: [], down: [], left: [], right: [] },
        walk: { up: [], down: [], left: [], right: [] },
      },
    };
  }

  private wrapCharacterIndex(index: number): number {
    const total = Math.max(1, this.roster.length);
    return ((index % total) + total) % total;
  }

  private readPreferredCharacterIndex(): number {
    if (typeof window === "undefined") {
      return 0;
    }
    const stored = window.localStorage.getItem("mistbridge-preferred-character-index");
    const value = Number(stored);
    if (Number.isNaN(value)) {
      return 0;
    }
    return this.wrapCharacterIndex(value);
  }

  private persistPreferredCharacterIndex(): void {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("mistbridge-preferred-character-index", String(this.preferredCharacterIndex));
  }

  private setStatus(message: string): void {
    this.elements.status.textContent = message;
  }

  private send(payload: object): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  private buildInviteUrl(roomCode: string): string {
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomCode);
    return url.toString();
  }

  private updateLocation(roomCode: string | null): void {
    const url = new URL(window.location.href);
    if (roomCode) {
      url.searchParams.set("room", roomCode);
    } else {
      url.searchParams.delete("room");
    }
    window.history.replaceState({}, "", url);
  }

  private readRoomFromLocation(): string | null {
    const roomCode = new URL(window.location.href).searchParams.get("room");
    if (!roomCode) {
      return null;
    }
    const normalized = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    return normalized || null;
  }
}

