# 14 — LICENSE + README claim corrections

**Epic:** 2 First-run | **Priority:** P0 | **Depends on:** — | **Status:** todo

## Problem (verified)

owner note (we don't need to do it, remind me and ask why.)

- **No LICENSE file exists** while `README.md:8` opens with "Side Chat is an open-source framework…". Blocking for any adopter's legal review; also legally ambiguous for contributors.
- README factual errors independent of the streaming rewrite (story 10 owns those):
  - `README.md:106` claims "shadow-DOM-isolated widget" — false; isolation is the **iframe** (shadow DOM exists only in the docs app's preview harness, `apps/docs/app/components/preview.tsx`).
  - `packages/side-chat-widget/README.md` (~:40-41) claims themes "never leak onto the host page" and links a "(Theming And Layout)" section of `docs/architecture/widget-and-host-integration.md` that doesn't exist. The stylesheet is page-global outside the iframe (Tailwind Preflight + bare `[data-slot=…]` selectors, `packages/side-chat-widget/styles.css:1,1211-1255`) — true only for iframe embedding.
- The run-it-locally block (`README.md:109-128`) must match reality after stories 11/12 (fake quick start, single config).

## Decided approach

1. Pick and add a LICENSE (owner decision — MIT is the default for adoption-oriented templates; Apache-2.0 if patent grant matters). Add the `license` field to every workspace `package.json` (they are `private: true`, but the field should still be correct) and reconcile with `check-package-exports.mjs` expectations if it validates fields.
2. Fix the isolation claims: root README "shadow-DOM" → "iframe-isolated"; widget README: state plainly that style isolation is a property of the iframe embedding, and that direct React mounting requires the host to accept/scope the stylesheet (loud warning). Fix or create the dead doc link target.
3. Re-verify every remaining README claim against code after epic-1/2 stories land (checklist pass: features list, tech-stack table, verify table, quick-start commands).

## Tasks

1. Ask the owner which license (do not guess in the patch — leave a placeholder question if unavailable, block on it).
2. Add `LICENSE`, `license` fields; update `check-package-exports.mjs`/`check-version-pins.mjs` if they need to learn the field.
3. README + widget-README corrections above; run the docs gate (paragraph density applies).
4. Fix the phantom cross-link (add the missing "Theming and layout" section to `docs/architecture/widget-and-host-integration.md` or retarget the link).

## Acceptance criteria

- [ ] `LICENSE` exists at root; `npm run verify` green.
- [ ] No README claims shadow-DOM isolation; widget README states the iframe condition explicitly.
- [ ] No dead intra-repo doc links in the two READMEs (spot-check with a link-check pass).

## Verification

```sh
npm run lint:custom
npm run verify
```
