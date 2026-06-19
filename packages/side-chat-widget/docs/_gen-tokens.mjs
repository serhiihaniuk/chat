import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/**
 * @typedef {Readonly<{
 *   t: string;
 *   v: string;
 *   p: string;
 *   c: string;
 * }>} TokenRow
 */

/** @type {Readonly<Record<string, string>>} */
const TOKEN_PREFIX_TO_COMPONENT = {
  switch: "switch",
  media: "media",
  menu: "menu",
  seg: "segmented",
  field: "field",
  title: "field",
  label: "field",
  hint: "field",
  scrollarea: "scroll-area",
  convo: "conversation-item",
  group: "conversation-grouping",
  rail: "sidebar-rail",
  panel: "shell",
  header: "shell",
  agent: "shell",
  row: "row",
  message: "message",
  action: "message-actions",
  badge: "badge",
  suggestion: "badge",
  send: "composer",
  composer: "composer",
  context: "composer",
  model: "model-selector",
  settings: "settings",
  tool: "tool-row",
  reason: "reasoning",
  error: "error-notice",
  btn: "button",
  iconbtn: "button",
  select: "select",
};

const INPUT_PATH = "packages/side-chat-widget/docs/_design-tokens.json";
const OUTPUT_PATH = "packages/side-chat-widget/src/showcase/docs/design-tokens.ts";

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) => typeof value === "object" && value !== null;

/**
 * @param {unknown} value
 * @returns {value is TokenRow}
 */
const isTokenRow = (value) =>
  isRecord(value) &&
  typeof value.t === "string" &&
  typeof value.v === "string" &&
  typeof value.p === "string" &&
  typeof value.c === "string";

/**
 * @param {unknown} value
 * @returns {readonly TokenRow[]}
 */
const parseTokenRows = (value) => {
  if (!Array.isArray(value) || !value.every(isTokenRow)) {
    throw new Error(`${INPUT_PATH} must contain token rows with t, v, p, and c strings.`);
  }
  return value;
};

/**
 * @returns {readonly TokenRow[]}
 */
const readTokenRows = () => {
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(INPUT_PATH, "utf8"));
  return parseTokenRows(parsed);
};

/**
 * @param {string} token
 */
const componentIdForToken = (token) => {
  const prefix = token.replace(/^--/, "").split("-")[0] ?? "";
  return TOKEN_PREFIX_TO_COMPONENT[prefix] ?? "";
};

/**
 * @param {string} value
 */
const escapeString = (value) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

/**
 * @param {TokenRow} row
 */
const tokenRowLine = (row) =>
  `  "${[
    row.t,
    escapeString(row.v),
    escapeString(row.p),
    escapeString(row.c),
    componentIdForToken(row.t),
  ].join("\t")}",`;

/**
 * @param {readonly TokenRow[]} rows
 */
const renderTokenModule = (
  rows,
) => `// AUTO-GENERATED from design_widget.html token tables (the design spec). Do not hand-edit;
// re-extract from the design file if tokens change. Rows are tab-delimited to keep source governance readable.
export type DesignToken = {
  readonly token: string;
  readonly resolvesTo: string;
  readonly property: string;
  readonly controls: string;
  readonly component: string;
};

const TOKEN_ROWS = [
${rows.map(tokenRowLine).join("\n")}
] as const;

const parseTokenRow = (row: string): DesignToken => {
  const [token, resolvesTo, property, controls, component] = row.split("\\t");
  if (!token || !resolvesTo || !property || !controls || component === undefined) {
    throw new Error(\`Invalid design token row: \${row}\`);
  }
  return { token, resolvesTo, property, controls, component };
};

export const designTokens: readonly DesignToken[] = TOKEN_ROWS.map(parseTokenRow);

export const tokensForComponent = (id: string): readonly DesignToken[] =>
  designTokens.filter((t) => t.component === id);
`;

/**
 * @param {readonly TokenRow[]} rows
 */
const countByComponent = (rows) => {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const row of rows) {
    const id = componentIdForToken(row.t) || "(none)";
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
};

/**
 * @param {Readonly<Record<string, number>>} counts
 */
const renderCounts = (counts) =>
  Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .map(([id, count]) => `${id}:${count}`)
    .join("  ");

const rows = readTokenRows();
mkdirSync("packages/side-chat-widget/src/showcase/docs", { recursive: true });
writeFileSync(OUTPUT_PATH, renderTokenModule(rows));

console.log(
  `wrote design-tokens.ts (${rows.length} rows). per-component: ${renderCounts(countByComponent(rows))}`,
);
