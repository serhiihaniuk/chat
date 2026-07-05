import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_WIDGET_THEME_ID, WIDGET_THEME_IDS } from "./widget-themes.js";

// The stylesheet lives at the package root; the theme + preview blocks are the CSS
// half of the theme contract that the TS list cannot see, so this test is the safety
// net the "Adding a theme" README recipe points at.
const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");

describe("widget theme completeness", () => {
  it("every canonical theme id has the CSS blocks its role requires", () => {
    for (const id of WIDGET_THEME_IDS) {
      // Every theme needs a preview band so its settings swatch renders its palette
      // (not a silent graphite fallback).
      expect(styles.includes(`[data-sidechat-theme-preview="${id}"]`)).toBe(true);

      // A named theme re-skins the root through a scoped attribute block; graphite is
      // the `:root` base and is the one theme that must carry NO such block.
      expect(styles.includes(`[data-sidechat-theme="${id}"]`)).toBe(id !== DEFAULT_WIDGET_THEME_ID);
    }
  });
});
