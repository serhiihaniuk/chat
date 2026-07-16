import { glossary } from "../glossary";
import type { GlossaryCategoryId, GlossaryTerm } from "./schema";

const byId = new Map(glossary.map((entry) => [entry.id, entry]));

export function findGlossaryTerm(id: string): GlossaryTerm | undefined {
  return byId.get(id);
}

export function glossaryByCategory(category: GlossaryCategoryId): readonly GlossaryTerm[] {
  return glossary.filter((entry) => entry.category === category);
}

/** Auto-link targets ordered longest-first to prefer the most specific phrase. */
export const autoLinkTargets: readonly { phrase: string; id: string }[] = glossary
  .flatMap((entry) => (entry.match ?? []).map((phrase) => ({ phrase, id: entry.id })))
  .sort((a, b) => b.phrase.length - a.phrase.length);
