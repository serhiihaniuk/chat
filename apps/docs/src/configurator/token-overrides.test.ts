import { describe, expect, it } from "vitest";

import type { CssToken, CssTokenName } from "../token-catalog.js";
import {
  createTokenOverrides,
  resetTokenOverrides,
  serializeTokenOverrides,
  updateTokenOverride,
} from "./token-overrides.js";

const PRIMARY_TOKEN: CssToken = {
  name: "--primary",
  defaultValue: "red",
  declaredValues: ["red", "blue"],
  group: "Foundations · Palette",
};

describe("token overrides", () => {
  it("stores changed values and removes values reset to their default", () => {
    const changed = updateTokenOverride(createTokenOverrides(), PRIMARY_TOKEN, "blue");
    expect(changed.get("--primary")).toBe("blue");

    const reset = updateTokenOverride(changed, PRIMARY_TOKEN, "red");
    expect(reset.has("--primary")).toBe(false);
  });

  it("resets a selected group without mutating unrelated overrides", () => {
    const current = new Map<CssTokenName, string>([
      ["--primary", "blue"],
      ["--radius", "1rem"],
    ]);

    const next = resetTokenOverrides(current, ["--primary"]);
    expect(next.has("--primary")).toBe(false);
    expect(next.get("--radius")).toBe("1rem");
  });

  it("exports a stable alphabetized JSON object", () => {
    const overrides = new Map<CssTokenName, string>([
      ["--radius", "1rem"],
      ["--primary", "blue"],
    ]);

    expect(serializeTokenOverrides(overrides)).toBe(
      '{\n  "--primary": "blue",\n  "--radius": "1rem"\n}',
    );
  });
});
