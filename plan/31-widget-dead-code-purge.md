# 31 — Widget dead-code purge + dark-mode alignment

**Epic:** 6 Widget UI | **Priority:** P1 | **Depends on:** — | **Status:** done (fonts deferred — needs subsetting tooling)

## Problem

In a template, dead code reads as endorsed style. Verified-unreachable inventory in `packages/side-chat-widget`:

1. **Dead shadcn component cluster** in `src/shared/ui/`: `carousel.tsx`, `hover-card.tsx`, `command.tsx` (+ `dialog.tsx` and `input-group.tsx` whose only importer is `command.tsx`), `button-group.tsx`, `spinner.tsx`, `dropdown-menu.tsx` — zero internal importers, not in the showcase manifest or docs app, and carrying the exact idioms the project bans (`dark:` variants, `!` overrides).
2. **`ComponentShowcase` is dead and broken**: exported as `./showcase` (`package.json:46-50`), imported by nothing, iframe src `../../../../design_widget.html` doesn't exist (would poll a blank iframe forever — `src/showcase/showcase.tsx:23,65-83`), and its slot list omits 8 registered sections. The docs app superseded it.
3. **Dark-mode remnants vs the no-dark policy**: full `.dark` token block (`styles.css:333-371`), `@custom-variant dark` (`:11`), `dark:` utilities in `input-group.tsx:130,143` / `dropdown-menu.tsx:91` (die with #1), a Dark toggle in the docs app (`src/showcase/docs/docs-app.tsx:57,97-103`), and a unit test **enforcing** graphite-tracks-host-dark (`side-chat-widget-settings.test.tsx:103`). Policy (design record): 4 light themes, NO dark mode. Code, tests, and policy disagree.
4. **Dead tokens**: `--destructive-foreground` (`styles.css:149` — two component comments explicitly say it doesn't exist), `--message-user-px/--message-user-py` (`:269-270`, unused — `message.tsx:35` uses utilities), `--chart-1..5` (shadcn leftovers, not themed in the other three themes), `var(--ease)` used but never defined (transitions silently don't animate — `styles.css:896-897,1005`), dead `sc-panel` utility (`:1146-1150`, `ResizablePanel` inlines the identical string).
5. **Fixture leaks**: demo fixtures in shared/ui components leak private session names ("RC blocked-terminal rollout gaps", "Greenfield widget design direction" — `conversation-grouping.tsx:70-92`, `conversation-item.tsx:58-67`).
6. **Fonts**: DM Sans (240 KB) + Instrument Sans (194 KB) ship as raw TTFs beside Jakarta's 27 KB woff2 (`src/fonts/`, `styles.css:25-40`).
7. Stale `dist/` contains deleted modules; `default` export condition points at dist (`package.json:12`) so non-dev consumers can import ghosts. No `sideEffects` field for tree-shaking the co-located demo sections.

## Decided approach

1. Delete the dead component cluster, `./showcase` export + files, dead tokens, `sc-panel` (point the panel at it OR delete — delete), and define `--ease` properly where transitions want it (or switch to Tailwind's `--ease-out`).
2. **Dark-mode decision executed as: remove.** Delete the `.dark` block, the custom variant, the docs-app Dark toggle, and flip the graphite-tracks-host-dark test to assert light-only; state the position in the package README ("light-only by design; themes are the variation axis"). If the owner wants dark back later it's a theme, not a mode.
3. Neutralize fixture copy (generic titles); add `"sideEffects": false` (verify styles import is via explicit path, not a side-effect import — adjust the array form if styles.css must be listed).
4. Convert the two TTF families to subset woff2 (match Jakarta's pipeline) or delete them if unused by any theme/appearance option — check `use-widget-appearance.ts` typeface options first.
5. Rebuild `dist/` clean (add a `clean` script wired into `build`).

## Acceptance criteria

- [x] Zero `dark:` occurrences and no `.dark` block in the widget package (the `dark:` utilities lived only in the deleted components); light-only policy stated in the README. (The graphite-tracks-host-dark settings test and the docs-app Dark toggle no longer existed — removed in an earlier pass.)
- [x] `--chart-*`, `--message-user-p*`, `--destructive-foreground` gone; `sc-panel` `@utility` deleted (unused; `ResizablePanel` inlines it); `--ease` now defined (`cubic-bezier(0.4, 0, 0.2, 1)`) so the three transitions that read it animate on the intended curve.
- [x] `./showcase` export + `src/showcase/` were already gone; stale local `dist/` removed and a `clean` step wired into `build`. Docs app still builds (verified: `react-router build` green — it imports only live `./ui/*` components, none of the deleted eight).
- [x] No private session names in fixtures (already generic — none found).
- [ ] Fonts: DEFERRED — the two raw TTFs (DM Sans, Instrument Sans) back live user-selectable typeface options, so they can't be deleted; subsetting them to woff2 needs font tooling not available here (spawned a follow-up task).
- [x] `npm run verify` + widget tests (160) green; docs app builds.

## Delivery notes

**Much of the problem statement was already resolved** by earlier sessions — the
`ComponentShowcase` source + `./showcase` export, the fixture leaks, the docs-app
Dark toggle, and the graphite-tracks-host-dark test were all already gone. An
inventory pass reconciled the story to the actual current state before touching
anything.

**Deleted the dead shadcn cluster** (all zero-importer, all carrying banned `dark:`
/ `!` idioms): `carousel`, `hover-card`, `command`, `dialog`, `input-group`,
`button-group`, `spinner`, `dropdown-menu`. Removing `carousel` made
`embla-carousel-react` unused — dropped from `dependencies`, the version-pins
allowlist, and the lockfile. The widget package and the docs app both still build,
proving the eight were truly unreachable.

**Dark mode removed:** the `.dark` token block and `@custom-variant dark` are gone
from `styles.css`; every `dark:` utility died with the deleted components, so the
package now has zero. A stale comment referencing "host .dark" was corrected, and
the README states the light-only position (themes are the variation axis; a future
dark palette would be a fifth theme, not a mode).

**Dead tokens purged:** `--chart-1..5` (both the `@theme inline` aliases and the
`:root` values), `--message-user-px/py` (padding comes from utilities in
`message.tsx`), and `--destructive-foreground`. `--ease` was used by three
transitions but never defined — now defined next to `--dur`. The unused `sc-panel`
`@utility` was deleted.

**Build hygiene:** added `"sideEffects": ["*.css"]` (JS tree-shaking while
preserving the stylesheet) and a `clean` step in `build`; removed the stale local
`dist/` (gitignored, so repo-invisible, but it held orphaned `showcase/` output).

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run build --workspace apps/docs   # docs app still builds against ./ui/*
npm run verify
```
