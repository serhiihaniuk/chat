# 32 — Theme single-sourcing + add-a-theme recipe

**Epic:** 6 Widget UI | **Priority:** P1 | **Depends on:** 31 | **Status:** done

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

- [x] One source of truth for theme ids/names/descriptions (`shared/lib/widget-themes.ts`) and one for appearance values (`shared/lib/widget-appearance-style.ts`). Grep confirms the old duplicates gone: no `THEME_PREVIEW_IDS`, `CORNER_RADIUS`/`ELEVATION_SHADOWS` defined once, theme copy defined once.
- [x] The completeness test fails when a theme id lacks either CSS block — proven by temporarily adding a `dummy` id (test went red: "expected false to be true"), then reverting (green).
- [x] Widget layer lint green (`check-widget-layers.mjs`): the canonical data lives in `shared` so `shared/ui` reads it without importing upward.
- [x] README "Adding a theme" recipe added (three edits, down from five); settings preview and live root agree by construction — both derive from the one `widgetAppearanceStyle`, and the preview inherits the root's tokens.

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget
npm run build --workspace apps/docs
npm run verify
```

## Delivery notes

**Theme data → `shared/lib/widget-themes.ts` (the FSD-correct home).** The layer
lint forbids `shared/ui` from importing `entities`, so the canonical list can't sit
in `entities/theme`. Moved `WIDGET_THEME_IDS`, `WidgetThemeId`, `WIDGET_THEMES`
(names + descriptions), `DEFAULT_WIDGET_THEME_ID`, and `isWidgetThemeId` down to
`shared`; `entities/theme/model/themes.ts` now re-exports them (product surface
unchanged). The settings picker reads `WIDGET_THEMES` directly and its
`THEME_PREVIEW_IDS` / duplicate `THEMES` array are gone; `ThemePreview`,
`ThemePreviewOption`, and `widget-root`'s `ThemeName` are now thin aliases of the
canonical `WidgetThemeId`/`WidgetTheme`, so the id union has one definition. (Minor:
the settings theme list now follows the canonical order — graphite, sapphire, sage,
ocean.)

**Appearance table de-duplicated.** `use-widget-appearance.ts` no longer inlines the
corner/density/text-scale/typeface/elevation tables that were verbatim copies of
`shared/lib/widget-appearance-style.ts`; it imports `widgetAppearanceStyle` and
builds the root props from it. The settings preview and the live root can no longer
drift — they read one function.

**Completeness safety net.** `widget-themes.test.ts` reads `styles.css` and asserts,
per canonical id: a `[data-sidechat-theme-preview="<id>"]` block always exists (the
settings swatch), and a `[data-sidechat-theme="<id>"]` block exists for every named
theme but NOT for the `:root`-based default (graphite). A missed CSS block now fails
`npm run verify`.

`npm run verify` green; widget suite 161 tests (the new completeness test); docs app
builds against `./ui/*`.
