# 31 — Widget dead-code purge + dark-mode alignment

**Epic:** 6 Widget UI | **Priority:** P1 | **Depends on:** — | **Status:** todo

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

- [ ] Zero `dark:` occurrences and no `.dark` block in the widget package; settings test updated; policy stated in README.
- [ ] `grep -rn "sc-panel\|--chart-\|--message-user-p\|destructive-foreground\|var(--ease)" packages/side-chat-widget/src` → only intentional hits.
- [ ] `./showcase` export gone; docs app unaffected (it imports `./ui/*`).
- [ ] No private session names in fixtures.
- [ ] Fonts ≤ ~30 KB per family as woff2, or removed.
- [ ] `npm run verify` + widget tests + e2e green; docs app still builds (`apps/docs` consumes `./ui/*` — do not break those exports).

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run test:e2e
npm run build
npm run verify
```
