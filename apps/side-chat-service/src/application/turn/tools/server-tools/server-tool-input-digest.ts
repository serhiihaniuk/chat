/** Canonicalize a JSON-safe tool input without silently omitting or coercing values. */
export function canonicalizeServerToolInput(input: unknown): string {
  return canonicalJson(input, new Set());
}

/** SHA-256 digest used to bind a durable approval to one canonical tool input. */
export async function createServerToolInputDigest(input: unknown): Promise<string> {
  const canonicalInput = new TextEncoder().encode(canonicalizeServerToolInput(input));
  const digest = await crypto.subtle.digest("SHA-256", canonicalInput);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalidInput();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return canonicalArray(value, ancestors);
  if (isPlainObject(value)) return canonicalObject(value, ancestors);
  throw invalidInput();
}

function canonicalArray(value: readonly unknown[], ancestors: Set<object>): string {
  enter(value, ancestors);
  try {
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
      throw invalidInput();
    }
    return `[${value.map((entry) => canonicalJson(entry, ancestors)).join(",")}]`;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalObject(value: Readonly<Record<string, unknown>>, ancestors: Set<object>): string {
  enter(value, ancestors);
  try {
    const keys = Object.keys(value).sort();
    assertPlainDataProperties(value, keys);
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], ancestors)}`)
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function assertPlainDataProperties(
  value: Readonly<Record<string, unknown>>,
  enumerableKeys: readonly string[],
): void {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== enumerableKeys.length) throw invalidInput();
  for (const key of enumerableKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw invalidInput();
    }
  }
}

function enter(value: object, ancestors: Set<object>): void {
  if (ancestors.has(value)) throw invalidInput();
  ancestors.add(value);
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidInput(): TypeError {
  return new TypeError("Server tool input must be a JSON-safe value");
}
