import type { CharacterRosterEntry } from "../app/assets";
import { assetUrl } from "../app/asset-url";
import type { PlayerId } from "../core/types";
import type {
  LobbyState,
  LobbySummary,
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
  applyOnlineSnapshot(snapshot: OnlineGameSnapshot): void;
  clearOnlinePeer(): void;
  receiveOnlineGuestInput(input: OnlineInputState): void;
}

interface SessionElements {
  shell: HTMLDivElement;
  browserList: HTMLDivElement;
  createTitle: HTMLInputElement;
  createButton: HTMLButtonElement;
  stageEyebrow: HTMLParagraphElement;
  stageTitle: HTMLHeadingElement;
  stageDescription: HTMLParagraphElement;
  stageMeta: HTMLParagraphElement;
  inviteInput: HTMLInputElement;
  copyButton: HTMLButtonElement;
  leaveButton: HTMLButtonElement;
  arenaViewport: HTMLDivElement;
  seats: Record<PlayerId, HTMLDivElement>;
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
  private lobbies: LobbySummary[] = [];
  private currentLobby: LobbyState | null = null;
  private pendingAutoJoinRoom: string | null;

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
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/online`);
    this.socket = socket;

    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("close", () => {
      this.role = null;
      this.roomCode = null;
      this.currentLobby = null;
      this.app.detachOnlineSession();
      this.setStatus("Connection closed. Refresh to reconnect to the global lobby.");
      this.renderLobbyList();
      this.renderStage();
    });
    socket.addEventListener("error", () => {
      this.setStatus("Connection failed. Refresh to retry.");
    });
  }

  private bindEvents(): void {
    this.elements.createButton.addEventListener("click", () => {
      const title = this.elements.createTitle.value.trim() || "Open Arena";
      this.send({ type: "create-lobby", title });
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
        this.lobbies = message.lobbies;
        this.renderLobbyList();
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

    const createButton = document.createElement("button");
    createButton.className = "lobby-button lobby-button--primary";
    createButton.type = "button";
    createButton.textContent = "Create lobby";

    createPanel.append(createTitle, createButton);

    const browserList = document.createElement("div");
    browserList.className = "lobby-browser__list";

    browser.append(brand, createPanel, browserList);

    const stage = document.createElement("section");
    stage.className = "lobby-stage";

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

    const copyButton = document.createElement("button");
    copyButton.className = "lobby-button";
    copyButton.type = "button";
    copyButton.textContent = "Copy invite";

    const leaveButton = document.createElement("button");
    leaveButton.className = "lobby-button lobby-button--danger";
    leaveButton.type = "button";
    leaveButton.textContent = "Leave lobby";

    inviteRow.append(inviteInput, copyButton, leaveButton);

    const arenaViewport = document.createElement("div");
    arenaViewport.className = "lobby-stage__viewport";

    const seatsWrap = document.createElement("div");
    seatsWrap.className = "lobby-seats";

    const seats = {
      1: document.createElement("div"),
      2: document.createElement("div"),
    } as Record<PlayerId, HTMLDivElement>;
    seats[1].className = "lobby-seat";
    seats[2].className = "lobby-seat";
    seatsWrap.append(seats[1], seats[2]);

    const status = document.createElement("p");
    status.className = "lobby-status";

    stage.append(stageIntro, inviteRow, arenaViewport, seatsWrap, status);
    shell.append(browser, stage);
    root.prepend(shell);

    return {
      shell,
      browserList,
      createTitle,
      createButton,
      stageEyebrow,
      stageTitle,
      stageDescription,
      stageMeta,
      inviteInput,
      copyButton,
      leaveButton,
      arenaViewport,
      seats,
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
      return;
    }

    this.elements.shell.dataset.state = lobby.status === "playing" ? "match" : "lobby";
    this.elements.stageEyebrow.textContent = lobby.isHost ? "Your arena" : "Joined arena";
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
