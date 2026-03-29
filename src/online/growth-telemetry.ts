export type GrowthTelemetryEventName =
  | "session_start"
  | "session_end"
  | "landing_view"
  | "screen_view"
  | "quick_match_clicked"
  | "lobby_list_opened"
  | "lobby_create_clicked"
  | "lobby_join_clicked"
  | "lobby_joined"
  | "seat_claim_clicked"
  | "ready_clicked"
  | "character_selected"
  | "invite_copied"
  | "chat_sent"
  | "match_started"
  | "match_ended"
  | "lobby_left";

interface GrowthTelemetryEventBody {
  eventName: GrowthTelemetryEventName;
  occurredAtMs: number;
  anonPlayerId: string;
  sessionId: string;
  page: {
    path: string;
    host: string;
  };
  attribution: {
    referrerHost: string | null;
    referralId: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
  };
  context: Record<string, string | number | boolean | null>;
  payload: Record<string, string | number | boolean | null>;
}

interface TrackOptions {
  context?: Record<string, string | number | boolean | null | undefined>;
  payload?: Record<string, string | number | boolean | null | undefined>;
}

const ANON_PLAYER_ID_KEY = "bomba-anon-player-id";
const TELEMETRY_FLUSH_INTERVAL_MS = 4_000;
const TELEMETRY_BATCH_SIZE = 6;

export class GrowthTelemetryClient {
  private readonly anonPlayerId: string;
  private readonly sessionId: string;
  private readonly sessionStartedAtMs: number;
  private readonly baseAttribution: GrowthTelemetryEventBody["attribution"];
  private sessionEnded = false;
  private lastScreenName: string | null = null;
  private landingTracked = false;
  private queuedEvents: GrowthTelemetryEventBody[] = [];
  private flushTimer: number | null = null;

  constructor() {
    this.anonPlayerId = this.readOrCreateAnonPlayerId();
    this.sessionId = crypto.randomUUID();
    this.sessionStartedAtMs = Date.now();
    this.baseAttribution = this.readAttribution();
    this.bindLifecycleEvents();
    this.track("session_start");
  }

  public trackLandingView(): void {
    if (this.landingTracked) {
      return;
    }
    this.landingTracked = true;
    this.track("landing_view");
  }

  public trackScreenView(screenName: string, roomCode: string | null = null): void {
    if (this.lastScreenName === screenName) {
      return;
    }
    this.lastScreenName = screenName;
    this.track("screen_view", {
      context: {
        screen: screenName,
        roomCode,
      },
    });
  }

  public track(eventName: GrowthTelemetryEventName, options: TrackOptions = {}): void {
    const body: GrowthTelemetryEventBody = {
      eventName,
      occurredAtMs: Date.now(),
      anonPlayerId: this.anonPlayerId,
      sessionId: this.sessionId,
      page: {
        path: window.location.pathname,
        host: window.location.host,
      },
      attribution: this.baseAttribution,
      context: this.normalizeRecord(options.context),
      payload: this.normalizeRecord(options.payload),
    };

    this.enqueue(body);
  }

  public buildInviteUrl(roomCode: string): string {
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomCode);
    url.searchParams.set("utm_source", "invite");
    url.searchParams.set("utm_medium", "share");
    url.searchParams.set("utm_campaign", "player_invite");
    url.searchParams.set("ref", this.anonPlayerId.slice(0, 12));
    return url.toString();
  }

  private bindLifecycleEvents(): void {
    window.addEventListener("pagehide", () => {
      this.flushSessionEnd();
      this.flushNow(true);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.flushSessionEnd();
        this.flushNow(true);
      }
    });
  }

  private flushSessionEnd(): void {
    if (this.sessionEnded) {
      return;
    }
    this.sessionEnded = true;
    this.track("session_end", {
      payload: {
        durationMs: Math.max(0, Date.now() - this.sessionStartedAtMs),
      },
    });
  }

  private enqueue(body: GrowthTelemetryEventBody): void {
    this.queuedEvents.push(body);
    if (this.queuedEvents.length >= TELEMETRY_BATCH_SIZE) {
      this.flushNow(false);
      return;
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) {
      return;
    }
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      this.flushNow(false);
    }, TELEMETRY_FLUSH_INTERVAL_MS);
  }

  private flushNow(useBeacon: boolean): void {
    if (this.queuedEvents.length === 0) {
      return;
    }
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = this.queuedEvents.splice(0, this.queuedEvents.length);
    void this.sendBatch(batch, useBeacon);
  }

  private async sendBatch(batch: GrowthTelemetryEventBody[], useBeacon: boolean): Promise<void> {
    const encoded = JSON.stringify(batch);
    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([encoded], { type: "application/json" });
      if (navigator.sendBeacon("/api/telemetry", blob)) {
        return;
      }
    }

    try {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: encoded,
        keepalive: true,
      });
    } catch {
      // Telemetry cannot block gameplay flow.
    }
  }

  private normalizeRecord(
    source: Record<string, string | number | boolean | null | undefined> | undefined,
  ): Record<string, string | number | boolean | null> {
    const normalized: Record<string, string | number | boolean | null> = {};
    if (!source) {
      return normalized;
    }

    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) {
        continue;
      }
      normalized[key] = typeof value === "string"
        ? value.slice(0, 120)
        : value;
    }
    return normalized;
  }

  private readOrCreateAnonPlayerId(): string {
    const stored = window.localStorage.getItem(ANON_PLAYER_ID_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
    const nextId = crypto.randomUUID();
    window.localStorage.setItem(ANON_PLAYER_ID_KEY, nextId);
    return nextId;
  }

  private readAttribution(): GrowthTelemetryEventBody["attribution"] {
    const url = new URL(window.location.href);
    let referrerHost: string | null = null;
    if (document.referrer) {
      try {
        referrerHost = new URL(document.referrer).host;
      } catch {
        referrerHost = null;
      }
    }

    return {
      referrerHost,
      referralId: this.readShortQueryValue(url, "ref"),
      utmSource: this.readShortQueryValue(url, "utm_source"),
      utmMedium: this.readShortQueryValue(url, "utm_medium"),
      utmCampaign: this.readShortQueryValue(url, "utm_campaign"),
    };
  }

  private readShortQueryValue(url: URL, key: string): string | null {
    const value = url.searchParams.get(key);
    if (!value) {
      return null;
    }
    return value.trim().slice(0, 120) || null;
  }
}
