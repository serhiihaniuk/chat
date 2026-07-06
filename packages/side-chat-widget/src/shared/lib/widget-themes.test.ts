import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEFAULT_WIDGET_THEME_ID, WIDGET_THEME_IDS } from "./widget-themes.js";

// The stylesheet lives at the package root; the theme + preview blocks are the CSS
// half of the theme contract that the TS list cannot see, so this test is the safety
// net the "Adding a theme" README recipe points at.
const stylesUrl = new URL("../../../styles.css", import.meta.url);
const styles = readFileSync(stylesUrl, "utf8");

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

  // The `@font-face` `src` urls are resolved by the consumer's bundler relative to
  // the stylesheet. When the urls and the on-disk font files drift apart (e.g. the
  // files sit in `src/fonts` but the url says `./fonts`), every face 404s to the SPA
  // fallback and all typefaces collapse to the same system font — the typeface
  // setting then looks inert. Nothing else exercises the url→file link.
  it("resolves every self-hosted typeface url to a file that exists", () => {
    const urls = [...styles.matchAll(/url\("([^"]+\.(?:woff2?|ttf|otf))"\)/gu)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    );

    // The three shipped typefaces (Plus Jakarta Sans, DM Sans, Instrument Sans).
    expect(urls.length).toBe(3);
    for (const url of urls) {
      const asset = fileURLToPath(new URL(url, stylesUrl));
      expect(existsSync(asset), `missing font asset for url("${url}")`).toBe(true);
    }
  });
});
