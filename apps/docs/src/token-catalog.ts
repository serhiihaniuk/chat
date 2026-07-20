export type CssTokenName = `--${string}`;

export type CssToken = {
  readonly name: CssTokenName;
  readonly defaultValue: string;
  readonly declaredValues: readonly string[];
  readonly group: string;
};

export type CssTokenGroup = {
  readonly id: string;
  readonly label: string;
  readonly tokens: readonly CssToken[];
};

type MutableToken = {
  readonly name: CssTokenName;
  readonly defaultValue: string;
  readonly declaredValues: string[];
  readonly group: string;
};

const TOKEN_DECLARATION = /(--[a-z][a-z0-9-]*)\s*:\s*([^;{}]+);/giu;
const THEME_SELECTOR = /\[data-sidechat-theme(?:-preview)?="([a-z0-9-]+)"\]/giu;
const UNSAFE_VALUE = /[;{}<>]|url\s*\(|@import/iu;

const FOUNDATION_GROUPS: Readonly<Record<string, string>> = {
  animate: "Foundations · Motion",
  color: "Foundations · Color ledger",
  dur: "Foundations · Motion",
  ease: "Foundations · Motion",
  font: "Foundations · Typography",
  leading: "Foundations · Typography",
  radius: "Foundations · Shape",
  shadow: "Foundations · Elevation",
  size: "Foundations · Sizing",
  space: "Foundations · Spacing",
  spacing: "Foundations · Spacing",
  text: "Foundations · Typography",
  weight: "Foundations · Typography",
};

const PALETTE_PREFIXES = new Set([
  "accent",
  "background",
  "border",
  "card",
  "destructive",
  "foreground",
  "input",
  "muted",
  "popover",
  "primary",
  "ring",
  "secondary",
  "sidebar",
  "success",
]);

export function extractCssTokens(source: string): readonly CssToken[] {
  const tokens = new Map<CssTokenName, MutableToken>();

  for (const match of source.matchAll(TOKEN_DECLARATION)) {
    const rawName = match[1];
    const rawValue = match[2];
    if (!isCssTokenName(rawName) || rawValue === undefined) continue;

    const value = rawValue.trim();
    const existing = tokens.get(rawName);
    if (existing) {
      if (!existing.declaredValues.includes(value)) existing.declaredValues.push(value);
      continue;
    }

    tokens.set(rawName, {
      name: rawName,
      defaultValue: value,
      declaredValues: [value],
      group: groupForToken(rawName),
    });
  }

  return [...tokens.values()].sort(compareTokens);
}

export function groupCssTokens(tokens: readonly CssToken[]): readonly CssTokenGroup[] {
  const groups = new Map<string, CssToken[]>();
  for (const token of tokens) {
    const group = groups.get(token.group) ?? [];
    group.push(token);
    groups.set(token.group, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, groupedTokens]) => ({
      id: label.toLowerCase().replace(/[^a-z0-9]+/gu, "-"),
      label,
      tokens: groupedTokens,
    }));
}

export function extractThemeIds(source: string): readonly string[] {
  const themes = new Set<string>();
  for (const match of source.matchAll(THEME_SELECTOR)) {
    const theme = match[1];
    if (theme) themes.add(theme);
  }
  return [...themes].sort((left, right) => left.localeCompare(right));
}

export function validateCssTokenValue(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized) return "Enter a CSS value or reset this token.";
  if (UNSAFE_VALUE.test(normalized)) return "URLs and declaration-breaking characters are blocked.";
  return undefined;
}

export function isCssTokenName(value: string | undefined): value is CssTokenName {
  return value !== undefined && /^--[a-z][a-z0-9-]*$/iu.test(value);
}

function groupForToken(name: CssTokenName): string {
  const prefix = name.slice(2).split("-")[0] ?? "other";
  if (PALETTE_PREFIXES.has(prefix)) return "Foundations · Palette";
  if (prefix === "sc") {
    return name.startsWith("--sc-text-") ? "Foundations · Typography" : "Foundations · Core";
  }

  const foundation = FOUNDATION_GROUPS[prefix];
  if (foundation) return foundation;
  return `Components · ${humanize(prefix)}`;
}

function humanize(value: string): string {
  const spaced = value.replace(/[-_]+/gu, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Other";
}

function compareTokens(left: CssToken, right: CssToken): number {
  const groupOrder = left.group.localeCompare(right.group);
  return groupOrder === 0 ? left.name.localeCompare(right.name) : groupOrder;
}
