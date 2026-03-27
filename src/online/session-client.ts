import type { CharacterRosterEntry } from "../app/assets";
import { assetUrl } from "../app/asset-url";
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

  constructor(root: HTMLElement, app: OnlineGameAppBridge, roster: CharacterRosterEntry[]) {
    this.app = app;
    this.roster = roster;
    this.pendingAutoJoinRoom = this.readRoomFromLocation();
    this.elements = this.render(root);
    this.canvasObserver = new MutationObserver(() => this.mountCanvas(root));
    this.canvasObserver.observe(root, { childList: true });
    this.mountCanvas(root);
    this.bindEvents();
    this.connect();
  }

  public sendGuestInput(input: OnlineInputState): void {
    if (this.role !== "guest") {
      return;
    }
    this.send({ type: "guest-input", input });
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
      this.send({ type: this.quickMatchSearching ? "quick-match-cancel" : "quick-match" });
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
      if (event.key === "Enter") {
        event.preventDefault();
        this.sendChat();
      }
    });
  }

  private sendChat(): void {
    const body = this.elements.chatInput.value.trim();
    if (!body) {
      return;
    }
    this.send({ type: "chat-send", body });
    this.elements.chatInput.value = "";
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
        this.app.attachOnlineSession(this);
        this.updateLocation(message.lobby.roomCode);
        this.renderStage();
        this.renderLobbyList();
        this.setStatus("Lobby joined. Claim a slot, pick a character, then lock ready.");
        break;
      case "lobby-updated":
        this.currentLobby = message.lobby;
        this.roomCode = message.lobby.roomCode;
        this.renderStage();
        this.renderLobbyList();
        break;
      case "lobby-left":
        this.role = null;
        this.roomCode = null;
        this.currentLobby = null;
        this.updateLocation(null);
        this.app.detachOnlineSession();
        this.renderStage();
        this.renderLobbyList();
        this.setStatus("Back in the global lobby.");
        break;
      case "match-started":
        this.role = message.config.role;
        this.roomCode = message.config.roomCode;
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
        this.renderQuickMatchState();
        break;
      case "peer-left":
        this.app.clearOnlinePeer();
        this.elements.shell.dataset.state = "lobby";
        this.setStatus("The other pilot left. The room is open again.");
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
      <span>Public rooms. Two locked slots. Fast start.</span>
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

    const browserList = document.createElement("div");
    browserList.className = "lobby-browser__list";

    browser.append(brand, createPanel, browserList);

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
    } as Record<PlayerId, HTMLDivElement>;
    seats[1].className = "lobby-seat";
    seats[2].className = "lobby-seat";
    seatsWrap.append(seats[1], seats[2]);
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
      meta.textContent = `${lobby.roomCode} | ${lobby.occupantCount}/2 pilots | ${lobby.status}`;

      const seatStrip = document.createElement("div");
      seatStrip.className = "lobby-card__seats";
      seatStrip.append(
        this.renderSeatPill("P1", lobby.seats[1]),
        this.renderSeatPill("P2", lobby.seats[2]),
      );

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

  private renderQuickMatchState(): void {
    this.elements.quickMatchButton.textContent = this.quickMatchSearching ? "Cancel search" : "Find quick match";
    this.elements.quickMatchButton.dataset.searching = this.quickMatchSearching ? "true" : "false";
    this.elements.quickMatchMeta.textContent = this.quickMatchSearching
      ? "Searching for another pilot..."
      : this.quickMatchQueuedCount > 0
        ? `${this.quickMatchQueuedCount} pilot${this.quickMatchQueuedCount === 1 ? "" : "s"} in quick-match queue`
        : "Jump into a live match as soon as two players queue.";
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
        "Create a public lobby or join one from the live board. Once both pilots lock a slot and confirm their character, the match starts automatically.";
      this.elements.stageMeta.textContent = "Public rooms | Seat lock P1/P2 | Character select | Instant match start";
      this.elements.inviteInput.value = "";
      this.elements.copyButton.disabled = true;
      this.elements.leaveButton.disabled = true;
      this.elements.seats[1].replaceChildren(this.buildEmptySeat(1));
      this.elements.seats[2].replaceChildren(this.buildEmptySeat(2));
      this.renderChat();
      return;
    }

    this.elements.shell.dataset.state = lobby.status === "playing" ? "match" : "lobby";
    this.elements.stageEyebrow.textContent = "Open arena";
    this.elements.stageTitle.textContent = lobby.title;
    this.elements.stageDescription.textContent = lobby.status === "playing"
      ? "Match in progress. The room stays locked until one of the pilots leaves."
      : "Claim a side, browse the roster, and lock your ready state. Both pilots ready starts the round.";
    this.elements.stageMeta.textContent = `${lobby.roomCode} | ${lobby.occupantCount}/2 pilots | ${lobby.status === "playing" ? "Live match" : "Waiting room"}`;
    this.elements.inviteInput.value = this.buildInviteUrl(lobby.roomCode);
    this.elements.copyButton.disabled = false;
    this.elements.leaveButton.disabled = false;
    this.elements.seats[1].replaceChildren(this.buildSeatContent(1, lobby));
    this.elements.seats[2].replaceChildren(this.buildSeatContent(2, lobby));
    this.renderChat();
  }

  private renderChat(): void {
    this.elements.chatLog.replaceChildren();
    const entries = this.currentLobby?.chat ?? [];
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "lobby-chat__empty";
      empty.textContent = this.currentLobby
        ? "No messages yet. Chat is live during lobby and match."
        : "Join a room or quick match to chat.";
      this.elements.chatLog.appendChild(empty);
      this.elements.chatInput.disabled = true;
      this.elements.chatSend.disabled = true;
      return;
    }

    for (const entry of entries) {
      this.elements.chatLog.appendChild(this.renderChatEntry(entry));
    }

    this.elements.chatInput.disabled = false;
    this.elements.chatSend.disabled = false;
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
    meta.textContent = `${entry.authorLabel} · ${new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const body = document.createElement("p");
    body.className = "lobby-chat__body";
    body.textContent = entry.body;

    item.append(meta, body);
    return item;
  }

  private buildEmptySeat(playerId: PlayerId): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "lobby-seat__content";
    wrap.innerHTML = `
      <div class="lobby-seat__header">
        <span>P${playerId}</span>
        <strong>Open slot</strong>
        <em>Waiting for a pilot</em>
      </div>
      <div class="lobby-seat__placeholder">Claim this side to choose a character and ready up.</div>
    `;
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

    const characterMeta = document.createElement("div");
    characterMeta.className = "lobby-seat__meta";
    characterMeta.innerHTML = `<p>${character.name}</p><span>${seat.ready ? "Ready" : "Not ready"}</span>`;

    preview.append(image, characterMeta);

    const actions = document.createElement("div");
    actions.className = "lobby-seat__actions";

    if (!seat.clientId) {
      const claimButton = document.createElement("button");
      claimButton.className = "lobby-button lobby-button--primary";
      claimButton.type = "button";
      claimButton.textContent = `Claim P${playerId}`;
      claimButton.addEventListener("click", () => {
        this.send({ type: "claim-seat", seat: playerId });
      });
      actions.appendChild(claimButton);
    } else if (isSelf && lobby.status === "open") {
      const prevButton = document.createElement("button");
      prevButton.className = "lobby-button";
      prevButton.type = "button";
      prevButton.textContent = "Prev";
      prevButton.addEventListener("click", () => {
        this.send({ type: "set-character", characterIndex: this.wrapCharacterIndex(seat.characterIndex - 1) });
      });

      const nextButton = document.createElement("button");
      nextButton.className = "lobby-button";
      nextButton.type = "button";
      nextButton.textContent = "Next";
      nextButton.addEventListener("click", () => {
        this.send({ type: "set-character", characterIndex: this.wrapCharacterIndex(seat.characterIndex + 1) });
      });

      const readyButton = document.createElement("button");
      readyButton.className = `lobby-button ${seat.ready ? "lobby-button--danger" : "lobby-button--primary"}`;
      readyButton.type = "button";
      readyButton.textContent = seat.ready ? "Unlock" : "Lock ready";
      readyButton.addEventListener("click", () => {
        this.send({ type: "set-ready", ready: !seat.ready });
      });

      actions.append(prevButton, nextButton, readyButton);
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

  private setStatus(message: string): void {
    this.elements.status.textContent = message;
  }

  private send(payload: object): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(payload));
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
