export type GlossaryCategoryId =
  | "basics"
  | "ai"
  | "turn"
  | "events"
  | "identity"
  | "packages";

export interface GlossaryCategory {
  id: GlossaryCategoryId;
  title: string;
  blurb: string;
}

export interface GlossaryTerm {
  /** Slug used as the anchor on the Vocabulary page and the `<Term id>` key. */
  id: string;
  /** Canonical display name. */
  term: string;
  /** One-line, plain-English meaning. */
  definition: string;
  category: GlossaryCategoryId;
  /** Where the term is defined in code (path, optionally with the symbol). */
  code?: string;
  /** Phrases the auto-link plugin may wrap on first prose mention. */
  match?: string[];
}

export const glossaryCategories: readonly GlossaryCategory[] = [
  {
    id: "basics",
    title: "AI & LLM basics",
    blurb: "General language-model vocabulary — the words you need before reading the code.",
  },
  {
    id: "ai",
    title: "AI concepts",
    blurb: "The product shape, the model knobs, and the context the assistant runs on.",
  },
  {
    id: "turn",
    title: "Turn lifecycle",
    blurb: "One user message produces one assistant turn: a legacy fiber or replacement Workflow run.",
  },
  {
    id: "events",
    title: "Protocol & runtime events",
    blurb: "Legacy RuntimeEvents and replacement native UI chunks are separate pipelines.",
  },
  {
    id: "identity",
    title: "Identity & authority",
    blurb: "Authority is proven and fail-closed before any persistence or model work.",
  },
  {
    id: "packages",
    title: "Packages & boundaries",
    blurb: "Legacy layered packages and the replacement service coexist until cutover.",
  },
];
