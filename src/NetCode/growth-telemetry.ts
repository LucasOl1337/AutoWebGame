export type GrowthTelemetryEventName =
  | "session_start"
  | "session_end"
  | "landing_view"
  | "screen_view"
  | "quick_match_clicked"
  | "lobby_list_opened"
  | "lobby_create_clicked"
  | "lobby_join_clicked"
  | "lobby_code_join_submitted"
  | "lobby_joined"
  | "seat_claim_clicked"
  | "ready_clicked"
  | "character_selected"
  | "invite_copied"
  | "chat_sent"
  | "feedback_opened"
  | "feedback_submitted"
  | "billing_status_viewed"
  | "billing_checkout_clicked"
  | "billing_checkout_started"
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
const TELEMETRY_MAX_QUEUE_SIZE = 30;

function createTelemetryId(): string {
  const cryptoSource = globalThis.crypto;
  if (typeof cryptoSource?.randomUUID === "function") {
    return cryptoSource.randomUUID();
  }

  if (typeof cryptoSource?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoSource.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }

  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 14);
  return `telemetry-${timestamp}-${random}`;
}

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
    this.sessionId = createTelemetryId();
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
    this.trimQueuedEvents();
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
    void this.sendBatch(batch, useBeacon).then((sent) => {
      if (!sent && !useBeacon) {
        this.requeueFailedBatch(batch);
      }
    });
  }

  private requeueFailedBatch(batch: GrowthTelemetryEventBody[]): void {
    this.queuedEvents = batch.concat(this.queuedEvents).slice(0, TELEMETRY_MAX_QUEUE_SIZE);
    this.scheduleFlush();
  }

  private trimQueuedEvents(): void {
    if (this.queuedEvents.length <= TELEMETRY_MAX_QUEUE_SIZE) {
      return;
    }
    this.queuedEvents.splice(0, this.queuedEvents.length - TELEMETRY_MAX_QUEUE_SIZE);
  }

  private async sendBatch(batch: GrowthTelemetryEventBody[], useBeacon: boolean): Promise<boolean> {
    const encoded = JSON.stringify(batch);
    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([encoded], { type: "application/json" });
      if (navigator.sendBeacon("/api/telemetry", blob)) {
        return true;
      }
    }

    try {
      const response = await fetch("/api/telemetry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: encoded,
        keepalive: true,
      });
      return response.ok || (response.status >= 400 && response.status < 500);
    } catch {
      // Telemetry cannot block gameplay flow.
      return false;
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
    try {
      const stored = window.localStorage.getItem(ANON_PLAYER_ID_KEY);
      if (stored && stored.trim()) {
        return stored.trim();
      }
      const nextId = createTelemetryId();
      window.localStorage.setItem(ANON_PLAYER_ID_KEY, nextId);
      return nextId;
    } catch {
      return createTelemetryId();
    }
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
