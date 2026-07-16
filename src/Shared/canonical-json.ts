export type Sha256Digest = `sha256:${string}`;

export function canonicalJson(value: unknown): string {
  if (typeof value === "string") {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON does not support non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    assertJsonArray(value);
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    assertPlainJsonObject(value);
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        assertWellFormedUnicode(key);
        if (value[key] === undefined) throw new Error(`Canonical JSON does not support undefined at key ${key}`);
        return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
      })
      .join(",")}}`;
  }
  throw new Error(`Canonical JSON does not support ${typeof value}`);
}

function assertJsonArray(value: unknown[]): void {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) {
    throw new Error("Canonical JSON arrays do not support symbol properties");
  }
  const expectedKeys = new Set(["length"]);
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    expectedKeys.add(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) {
      throw new Error(`Canonical JSON does not support an array hole at index ${index}`);
    }
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`Canonical JSON only supports enumerable array data properties at index ${index}`);
    }
  }
  if (ownKeys.some((key) => typeof key === "string" && !expectedKeys.has(key))) {
    throw new Error("Canonical JSON arrays do not support extra properties");
  }
}

function assertPlainJsonObject(value: Record<string, unknown>): void {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Canonical JSON only supports plain objects");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error("Canonical JSON objects do not support symbol properties");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error(`Canonical JSON only supports enumerable data properties: ${key}`);
    }
  }
}

export async function sha256Canonical(value: unknown): Promise<Sha256Digest> {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)));
}

export async function sha256Bytes(value: BufferSource): Promise<Sha256Digest> {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 is unavailable in this runtime");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", value);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

function assertWellFormedUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("Unicode contains an unpaired surrogate");
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error("Unicode contains an unpaired surrogate");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
