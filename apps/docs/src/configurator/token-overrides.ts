import type { CssToken, CssTokenName } from "../token-catalog.js";

export type TokenOverrides = ReadonlyMap<CssTokenName, string>;

export function createTokenOverrides(): TokenOverrides {
  return new Map<CssTokenName, string>();
}

export function updateTokenOverride(
  current: TokenOverrides,
  token: CssToken,
  value: string,
): TokenOverrides {
  const next = new Map(current);
  if (value.trim() === token.defaultValue) {
    next.delete(token.name);
  } else {
    next.set(token.name, value);
  }
  return next;
}

export function resetTokenOverrides(
  current: TokenOverrides,
  tokenNames: readonly CssTokenName[],
): TokenOverrides {
  const next = new Map(current);
  for (const name of tokenNames) next.delete(name);
  return next;
}

export function serializeTokenOverrides(overrides: TokenOverrides): string {
  const entries = [...overrides.entries()].sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(entries), null, 2);
}
