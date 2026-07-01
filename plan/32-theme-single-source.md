# 32 — Theme single-sourcing + add-a-theme recipe

**Epic:** 6 Widget UI | **Priority:** P1 | **Depends on:** 31 | **Status:** todo

## Problem

The theme/appearance contract is triplicated and drifting:

- Theme names/descriptions exist twice: `entities/theme/model/themes.ts:18-39` vs `shared/ui/settings/theme-group.tsx:14-35`.
- Theme id unions exist three times: `WIDGET_THEME_IDS` (entities), `ThemeName` (`shared/ui/widget-root.tsx:24`), `THEME_PREVIEW_IDS` (`shared/ui/settings/theme-preview-card.tsx:3-10`).
- Appearance value tables are duplicated **verbatim**: `features/theme/model/use-widget-appearance.ts:62-125` vs `shared/lib/widget-appearance-style.ts:1-64` — change corner radius in one and the settings preview disagrees with the live root.
- Adding a theme takes 5 undocumented touch points (styles.css theme block ~35 lines + `[data-sidechat-theme-preview]` block at `styles.css:381-512` + the three TS surfaces above); miss the preview block and the settings swatch silently renders graphite.

FSD note: `shared/ui` cannot import from `entities/theme` (layer lint imports only downward: shared is the bottom). Single-sourcing must respect that — the canonical data lives in the LOWEST consumer layer or is passed down as props.

## Decided approach

1. One canonical theme module in `shared` (lowest common layer): ids, names, descriptions, preview metadata as `as const` data; `entities/theme` re-exports/derives; settings components consume the data instead of local tables. (If product semantics argue for `entities/theme` as canon, pass data down via props instead — decide in-story against `check-widget-layers.mjs` and note the choice.)
2. One appearance table: keep `shared/lib/widget-appearance-style.ts` as canon (shared layer, both consumers can reach it); `use-widget-appearance.ts` imports it; delete the duplicate.
3. A completeness test: for each id in the canonical list, assert `styles.css` contains a `[data-sidechat-theme="<id>"]` block AND a `[data-sidechat-theme-preview="<id>"]` block (string-level check over the css file is fine and cheap).
4. Write "Adding a theme" in the package README: the (now fewer) touch points as a checklist, with the completeness test as the safety net.

## Acceptance criteria

- [ ] One source of truth for theme ids/names/descriptions and one for appearance values (grep: old duplicates gone).
- [ ] The completeness test fails when a theme id lacks either CSS block (prove with a temporary dummy id).
- [ ] Widget layer lint green (`scripts/check-widget-layers.mjs` via `npm run lint:custom`).
- [ ] README recipe exists; settings preview and live root agree after changing one appearance value (manual harness check).

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run lint:custom
npm run verify
```
