import { isValidElement, type ReactNode } from "react";

import type { CitationSource } from "#shared/ui/activity/citations";

/**
 * A source the model authored as a GFM footnote definition, carrying the number
 * it was defined in (`[^1]` → 1). Inline `[^n]` markers, the hover card, and the
 * bottom fold all bind to this number — and because one author (the model) wrote
 * both the markers and the definitions, the numbering is consistent by
 * construction, with no separate channel to drift against.
 */
export type FootnoteSource = CitationSource & { readonly number: number };

const FOOTNOTE_DEFINITION = /^\[\^[^\]]+\]:[ \t]+(.+)$/gmu;
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/u;
const BARE_URL = /(https?:\/\/[^\s)]+)/u;
const TRAILING_SEPARATOR = /[\s–—.,;:–-]+$/u;
// The optional snippet the model quotes after the source (straight or curly quotes).
// A minimum length keeps a quoted word inside the title from reading as the excerpt.
const EXCERPT_QUOTE = /["“]([^"”]{10,})["”]/gu;

/**
 * Parse the message's GFM footnote definitions into ordered sources.
 *
 * Numbered by document order (1..N), matching the sequential-numeric contract the
 * system prompt asks the model to follow — so definition order equals the display
 * number remark assigns each inline reference. Each definition yields a label and,
 * when present, a URL (from a Markdown link or a bare URL); a definition with
 * neither is a terminal source, exactly like the fold's non-linked rows.
 */
export const parseFootnoteSources = (markdown: string): readonly FootnoteSource[] =>
  [...markdown.matchAll(FOOTNOTE_DEFINITION)].map((match, index) =>
    toFootnoteSource(index + 1, match[1]!.trim()),
  );

/**
 * Resolve an inline `[^n]` marker's rendered number to its parsed source.
 *
 * The number the reader sees (`markerText`) is the 1-based citation number the
 * model authored; the source it binds to is the definition at that position. A
 * number with no matching definition returns `undefined`, so the marker degrades
 * to plain text instead of a chip pointing at nothing.
 */
export const footnoteSourceForMarker = (
  sources: readonly FootnoteSource[],
  markerText: string,
): FootnoteSource | undefined => sources[Number.parseInt(markerText.trim(), 10) - 1];

const toFootnoteSource = (order: number, content: string): FootnoteSource => {
  const { excerpt, rest } = extractExcerpt(content);
  const link = MARKDOWN_LINK.exec(rest);
  if (link) {
    const label = collapse(rest.replace(MARKDOWN_LINK, link[1]!));
    return withExcerpt({ number: order, label: label || link[1]!, url: link[2]! }, excerpt);
  }
  const bare = BARE_URL.exec(rest);
  if (bare) {
    const label = collapse(rest.replace(bare[1]!, ""));
    return withExcerpt({ number: order, label: label || bare[1]!, url: bare[1]! }, excerpt);
  }
  const label = collapse(rest);
  // A lone quote with no title or url is itself the terminal source — the quoted
  // text is the label, not a snippet of some other, unnamed source.
  if (!label && excerpt) return { number: order, label: excerpt };
  return withExcerpt({ number: order, label }, excerpt);
};

// Lift the quoted snippet out of the definition before the url/label parse, so a
// URL inside the quote can't be read as the source link. The longest quoted run is
// the excerpt; a shorter quoted phrase in the title is left in place.
const extractExcerpt = (content: string): { readonly excerpt?: string; readonly rest: string } => {
  const matches = [...content.matchAll(EXCERPT_QUOTE)];
  if (matches.length === 0) return { rest: content };
  const best = matches.reduce((longest, match) =>
    match[1]!.length > longest[1]!.length ? match : longest,
  );
  return { excerpt: normalize(best[1]!), rest: content.replace(best[0], " ") };
};

const withExcerpt = (source: FootnoteSource, excerpt: string | undefined): FootnoteSource =>
  excerpt ? { ...source, excerpt } : source;

const collapse = (value: string): string => normalize(value).replace(TRAILING_SEPARATOR, "").trim();

const normalize = (value: string): string => value.replace(/\s+/gu, " ").trim();

/**
 * Flatten a rendered node subtree to its text.
 *
 * The `[^n]` reference reaches the `sup` override already mapped to a link button
 * whose only text is the number; this reads that number back so the override can
 * resolve it to a parsed source (and fall through to a plain superscript when it
 * does not resolve — a marker the model wrote without a matching definition).
 */
export const reactNodeText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(reactNodeText).join("");
  if (isValidElement<{ readonly children?: ReactNode }>(node)) {
    return reactNodeText(node.props.children);
  }
  return "";
};
