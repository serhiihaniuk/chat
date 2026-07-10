---
name: side-chat-design-system
description: Review, implement, or document the Side Chat widget design system. Use when changing widget styling, design tokens, density, themes, Base UI primitives, portal or data-slot contracts, hook utilities, or design-system documentation. Apply it before adding a CSS class or design value in packages/side-chat-widget or the corresponding apps/docs pages.
---

# Side Chat widget design system

The widget is defined **entirely in tokens**. A component never hard-codes a colour,
radius, or spacing value — it reads a token, and tokens cascade down three tiers.
Spacing is one density lever. Every design-significant value is a **named token that
is documented in apps/docs**. Get this wrong and it fails review, not `verify`: raw
Tailwind numbers and inline `calc()` compile fine but violate the system.

## Before changing the visual system

Read `AGENTS.md`, `docs/README.md`, `docs/domain/vocabulary.md`, the nearest
package README, and the relevant design-system foundation or component page.
Treat `packages/side-chat-widget/README.md` and the files named below as current
repository evidence; do not rely on this skill when the code or canonical docs
have changed.

## When to use this skill

Use it whenever you add or change anything a user sees in `packages/side-chat-widget`:
a component's spacing/colour/size, a hook class, a token, a theme, a Base UI popup, or
the apps/docs page that documents it. Read it **before** writing a class or a CSS value
— the discipline is "which token expresses this?", never "what pixel value looks right?".

This skill owns the token/kit/theme/apps-docs contract. For prose-documentation
quality, also use `side-chat-documentation`. For code-shape budgets, use the
repository's configured `verify` gate.

## The three-tier token model (canonical: apps/docs/content/docs/design-system/foundations/architecture.mdx)

- **Tier 1 — Primitive.** Raw palette + scales: `--background`, `--foreground`,
  `--primary`, `--radius`, `--text-*`, size scales. Declared on the widget root
  (`:root` in the built CSS), and mapped to Tailwind's `--color-*` / scales in the
  `@theme inline {…}` **ledger** at the top of `styles.css` — that ledger is what makes
  `bg-primary`, `text-muted-foreground`, `rounded-md` resolve to tokens.
- **Tier 2 — Component.** Every part owns named vars that **alias** tier 1 or a
  `calc()` over `--spacing` — e.g. `--switch-track-on: var(--primary)`,
  `--cite-marker-size: calc(var(--spacing) * 4.5)`. Declared on
  `.side-chat-widget-root` so a `data-sidechat-theme` on that same element re-substitutes
  them. **This is the re-skin contract** — tier 2 must live on the root, never `:root`.
- **Tier 3 — Hook classes.** `@utility sc-*` classes read tier-2 tokens. The **only**
  layer that touches real CSS properties.

Density (`apps/docs/content/docs/design-system/foundations/spacing.mdx`): there is no `--space-1..16` scale. Every
pad/gap is a `calc()` over one lever, `--space-unit`, bridged to Tailwind's `--spacing`
(`--spacing: var(--space-unit, 0.25rem)`), so component tokens AND Tailwind spacing
utilities re-scale together when the Density control changes. Any spacing token you add
must resolve through `--spacing` or it won't respond to density.

Themes (widget README "Adding a theme"; `apps/docs/content/docs/design-system/foundations/themes.mdx`): **four
light themes, no dark mode.** Graphite is the base `:root`/root contract and carries no
attribute; Sapphire/Sage/Ocean are light-only tier-2 overrides written via
`[data-sidechat-theme="<id>"]` blocks. Light-only is deliberate — a future palette is a
fifth theme, never a mode. The shipped widget root does **not** respond to the host's
`.dark`/`prefers-color-scheme` (package README is authoritative). Note the drift: some
foundations docs + the apps/docs Dark toggle still mention a host `.dark` on graphite —
that's stale relative to the README; don't build on it or reintroduce a dark mode.

## Where everything lives

- `packages/side-chat-widget/styles.css` — **the one stylesheet** (package ROOT, not
  `src/`; exported as `./styles.css`). Sections, in order:
  1. `@import "tailwindcss"` + streamdown + `@font-face` (fonts live in `./src/fonts/**`;
     the `@font-face src` must say `./src/fonts/...` — see Pitfalls).
  2. `@theme inline {…}` / `@theme {…}` — the tier-1 → Tailwind ledger.
  3. `.side-chat-widget-root {…}` — tier-1 aliases + **all tier-2 component tokens**.
  4. `[data-sidechat-theme="sapphire|sage|ocean"] {…}` — theme overrides, and
     `[data-sidechat-theme-preview="…"]` for the settings swatches.
  5. `@layer base {…}` — resets.
  6. `@utility sc-* {…}` — the tier-3 hook classes (a CLOSED list; see Pitfalls) — then
     the unlayered `[data-slot="…-content"]` portaled-popup surfaces.
- `src/shared/ui/**` — the kit primitives (button, menu, tooltip, dialog, citations,
  settings/…). Built directly on Base UI, styled through hook classes + tier-2 tokens.
- `src/shared/ui/widget-root.tsx` — `SideChatWidgetRoot` + `usePortalContainer()`.
- `src/shared/ai/**` — **copied vendor primitives (Streamdown wrapper). Do NOT restyle
  as project code** (boundary rule in the package README).
- `apps/docs/` — the design-system site (Fumadocs + React Router SPA):
  - `content/docs/design-system/foundations/*.mdx` — the canonical token/theme/spacing
    docs. Link to these; never re-explain the tiers elsewhere.
  - `content/docs/design-system/{primitives,components}/*.mdx` — one page per part.
  - `app/components/demos/*.tsx` — each demo imports and renders the **REAL** widget
    component (`@side-chat/side-chat-widget/ui/*`), never a copy.
  - `app/components/preview.tsx` — `<Preview>` renders demos in an isolated **Shadow
    DOM** with the widget's full stylesheet, so widget CSS never collides with Fumadocs.
  - `app/data/tokens-components.ts` — the `<TokenTable group="…" />` data, one row per
    token: `{ token, resolvesTo, property, usage }`.
- `design_system.html` (repo root) — the canonical visual reference; match it when a
  component's look is in question.

## Non-negotiable rules

1. **No literal colours, no arbitrary `[…]` values.** Use ledger utilities
   (`bg-popover`, `text-muted-foreground`, `rounded-xl`) or tier-2 tokens. A one-off hex
   or `mt-[13px]` is a review failure.
2. **Every design-significant spacing/size is a named tier-2 token** that resolves
   through `--spacing`, documented in `tokens-components.ts`. `gap-2` and inline
   `calc(var(--spacing)*N)` are density-aware but NOT tokens — promote reused/meaningful
   ones to `--<component>-<role>` and read that.
3. **Base UI state via named variants** (`checked:`, `highlighted:`, `pressed:`,
   `popupopen:`), never `:hover` / `data-[…]:` on a Base UI part. Plain `<button>`s may
   use `hover:`/`focus-visible:`.
4. **Popups portal into the widget root** via `usePortalContainer()` and tag their
   surface with `data-slot="…-content"` (dropdown-menu / popover / select / combobox /
   tooltip / hover-card / dialog). The slot gets font-scoping + surface styles in
   styles.css. A popup rendered to `document.body` loses the theme + font.
5. **The `@utility sc-*` layer is a closed, irreducible list** — add a hook class ONLY
   for a value a utility genuinely can't express: a `calc()`-derived value, a portaled
   element's surface, or a runtime var. Prefer Tailwind ledger utilities + tier-2 tokens
   inline on the component.
6. **Tier 2 lives on `.side-chat-widget-root`**, never `:root` — else themes can't
   re-skin it.

## Workflows

### Style or change a component
1. Reach for a **ledger utility** (colour/radius) or a **tier-2 token** first.
2. If the value is design-significant spacing/size and reused or worth naming, add a
   tier-2 token (next workflow) and read it — don't inline `calc()`.
3. Add or edit a hook class only for irreducible CSS (rule 5).
4. If you changed a documented value, update its `tokens-components.ts` row.

### Add a tier-2 token (docs first)
1. **Document it first** in `apps/docs/app/data/tokens-components.ts` under the
   component's group: `{ token: "--foo-bar", resolvesTo: "calc(var(--spacing) * N)" | "var(--tier1)", property: "…", usage: "…" }`. This is the contract.
2. Define it in `styles.css` inside `.side-chat-widget-root` (spacing → `calc(var(--spacing) * N)` so density flows; colour → `var(--tier1)`).
3. Read it from the hook class / component. Verify density moves it (see Verify).

### Base UI popup (menu, tooltip, dialog, hover card, …)
Mirror an existing kit part (e.g. `shared/ui/tooltip.tsx`, `dialog.tsx`): `Root` →
`Portal container={usePortalContainer()}` → `Positioner` → `Popup data-slot="…-content"`.
Compose the parts yourself; state via named variants (rule 3).

### Add a theme (three edits, README "Adding a theme")
1. Add `{ id, name, description }` to `WIDGET_THEMES` (+ id to `WIDGET_THEME_IDS`) in
   `src/shared/lib/widget-themes.ts` (single source; `entities/theme` + settings read it).
2. Add a `[data-sidechat-theme="<id>"]` override block in `styles.css` (copy a named
   theme; graphite is the `:root` base with no block).
3. Add a `[data-sidechat-theme-preview="<id>"]` block for the settings swatch.
`widget-themes.test.ts` fails if either block is missing.

### Document a component in apps/docs
1. `content/docs/design-system/{primitives,components}/<id>.mdx` — prose (role, anatomy,
   the contract), a `<Preview>` with a demo, and `<TokenTable group="<id>" />`. Add the
   page id to the section `meta.json`.
2. `app/components/demos/<id>.tsx` — render the **real** exported component.
3. Token rows in `tokens-components.ts`.

## Verify

- `npm run verify` (from repo root) — format, oxlint (JS/TS + package import boundaries),
  typecheck, tests, build, custom governance (code-shape budgets, generated artifacts).
  If the shell is not using the pinned Node/npm versions, run
  `npx -p node@24.16.0 -p npm@11.15.0 npm run verify`.
  Green before done. Note: the token discipline itself (no arbitrary values, no literal
  colours, Base UI named variants) is a **contract caught in review**, not an automated
  lint rule — `verify` will not stop you from hard-coding a pixel, so hold the line.
- `npm run build -w @side-chat/docs` when you touched apps/docs.
- Completeness tests catch drift: `widget-themes.test.ts` (every theme id has its CSS
  blocks, incl. the `@font-face` asset paths). Mirror this — if you add a
  parse-once-render-many contract, pin it with a test.
- **Prove density** for any spacing/size token: in the running widget, mutate the root's
  `--space-unit` and confirm the computed value scales (fold gap, marker, padding all
  move together). If it doesn't move, it isn't resolving through `--spacing`.

## Governance budgets (enforced by verify)

- **300-line** production-source file budget (test files count). Split or relocate;
  co-locate tests thematically (a `WidgetMessageView` sources-fold test belongs with the
  activity-content tests, not bloating the main file).
- **≤5 source files per directory** (exceptions in `scripts/check-source-governance.mjs`
  / `check-code-shape.mjs` as a Map with a stated reason — extend it only with a real
  reason).

## Pitfalls (seen in real changes)

- **Raw Tailwind numbers / inline `calc()` instead of named tokens.** `gap-2`,
  `min-width: calc(var(--spacing)*4.5)` are density-aware but bypass the token layer and
  the docs. Promote to `--message-stack-gap`, `--cite-marker-size`, document, then read.
- **Per-part hardcoded spacing → inconsistent rhythm.** Space a message's stacked parts
  (reasoning, answer, sources) with ONE token (`--message-stack-gap`) so they match and
  scale together — don't give one part its own `mt-4`.
- **Font/asset paths.** `styles.css` is at the package ROOT; its `@font-face src` must be
  `./src/fonts/…` (the files live in `src/fonts/`). A wrong path 404s to the SPA
  fallback and every typeface silently falls back to system — pinned by the theme
  completeness test.
- **Restyling `src/shared/ai/**`.** It's copied vendor code; customise the Streamdown
  wrapper (`markdown-content.tsx`) via its props/component overrides, not by editing the
  vendored primitives.
- **Popup to `document.body`.** Forgetting `usePortalContainer()` drops the theme + font
  and can render unstyled over the host page.
- **Base UI `:hover`.** Use `highlighted:`/`pressed:`/`checked:`; `:hover` on a Base UI
  part is a gate failure.
