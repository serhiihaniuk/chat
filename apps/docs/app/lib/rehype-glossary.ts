/**
 * rehype plugin: wrap the first prose mention of each glossary term in a
 * <Term id="..."> element, so it renders the hover card. Runs at MDX compile
 * time, walking the tree in document order, so "first mention per page" is
 * deterministic. Skips code, links, headings, and existing <Term> elements.
 */
import { autoLinkTargets } from "../data/glossary/lookup";

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  name?: string;
  children?: HastNode[];
  [key: string]: unknown;
}

const EXCLUDED = new Set(["code", "pre", "a", "h1", "h2", "h3", "h4", "h5", "h6", "Term", "Glossary"]);

const matchers = autoLinkTargets.map((target) => ({
  id: target.id,
  length: target.phrase.length,
  re: new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(target.phrase)}(?![A-Za-z0-9])`, "i"),
}));

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function tagOf(node: HastNode): string {
  if (node.type === "element") return node.tagName ?? "";
  if (node.type === "mdxJsxTextElement" || node.type === "mdxJsxFlowElement") return node.name ?? "";
  return "";
}

function termElement(id: string, text: string): HastNode {
  return {
    type: "mdxJsxTextElement",
    name: "Term",
    attributes: [{ type: "mdxJsxAttribute", name: "id", value: id }],
    children: [{ type: "text", value: text }],
  };
}

// Replace the earliest unused term match in one text value, then recurse on the
// remainder so several distinct terms in one node each get their first mention.
function linkText(value: string, used: Set<string>): HastNode[] {
  let best: { index: number; length: number; id: string } | null = null;
  for (const matcher of matchers) {
    if (used.has(matcher.id)) continue;
    const found = matcher.re.exec(value);
    if (found && (!best || found.index < best.index)) {
      best = { index: found.index, length: matcher.length, id: matcher.id };
    }
  }
  if (!best) return [{ type: "text", value }];

  used.add(best.id);
  const before = value.slice(0, best.index);
  const matched = value.slice(best.index, best.index + best.length);
  const after = value.slice(best.index + best.length);

  const out: HastNode[] = [];
  if (before) out.push({ type: "text", value: before });
  out.push(termElement(best.id, matched));
  if (after) out.push(...linkText(after, used));
  return out;
}

function walk(node: HastNode, inExcluded: boolean, used: Set<string>): void {
  if (!node.children) return;
  const childExcluded = inExcluded || EXCLUDED.has(tagOf(node));
  const next: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && !childExcluded) {
      next.push(...linkText(child.value ?? "", used));
    } else {
      walk(child, childExcluded, used);
      next.push(child);
    }
  }
  node.children = next;
}

export function rehypeGlossary() {
  return (tree: HastNode) => {
    walk(tree, false, new Set<string>());
  };
}
