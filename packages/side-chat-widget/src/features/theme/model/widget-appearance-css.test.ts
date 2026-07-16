import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  WIDGET_CORNERS_IDS,
  WIDGET_DENSITY_IDS,
  WIDGET_ELEVATION_IDS,
  WIDGET_TEXT_SIZE_IDS,
  WIDGET_TYPEFACE_IDS,
} from "./use-widget-appearance.js";

const styles = readFileSync(new URL("../../../../styles.css", import.meta.url), "utf8");

const APPEARANCE_IDS = {
  corners: Object.values(WIDGET_CORNERS_IDS),
  density: Object.values(WIDGET_DENSITY_IDS),
  elevation: Object.values(WIDGET_ELEVATION_IDS),
  "text-size": Object.values(WIDGET_TEXT_SIZE_IDS),
  typeface: Object.values(WIDGET_TYPEFACE_IDS),
} as const;

describe("widget appearance CSS contract", () => {
  it("defines a token selector for every closed appearance id", () => {
    for (const [attribute, ids] of Object.entries(APPEARANCE_IDS)) {
      for (const id of ids) {
        expect(styles).toContain(`[data-sidechat-${attribute}="${id}"]`);
      }
    }
  });

  it("routes Tailwind text utilities through runtime widget text tokens", () => {
    for (const size of ["2xs", "xs", "sm", "base", "md", "lg", "xl"]) {
      expect(styles).toContain(`--text-${size}: var(--sc-text-${size});`);
    }
  });
});
