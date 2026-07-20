import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  extractCssTokens,
  extractThemeIds,
  groupCssTokens,
  validateCssTokenValue,
} from "./token-catalog.js";

const widgetStyles = readFileSync(
  new URL("../../../packages/side-chat-widget/styles.css", import.meta.url),
  "utf8",
);

describe("CSS token catalog", () => {
  it("discovers each token once while retaining theme variants", () => {
    const tokens = extractCssTokens(`
      :root { --primary: red; --radius: 10px; }
      [data-sidechat-theme="ocean"] { --primary: blue; }
    `);

    expect(tokens).toEqual([
      {
        name: "--primary",
        defaultValue: "red",
        declaredValues: ["red", "blue"],
        group: "Foundations · Palette",
      },
      {
        name: "--radius",
        defaultValue: "10px",
        declaredValues: ["10px"],
        group: "Foundations · Shape",
      },
    ]);
  });

  it("covers every custom property declaration in the widget stylesheet", () => {
    const tokens = extractCssTokens(widgetStyles);
    const names = tokens.map((token) => token.name);
    const declarations = [...widgetStyles.matchAll(/(--[a-z][a-z0-9-]*)\s*:/giu)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);

    expect(new Set(names)).toEqual(new Set(declarations));
    expect(names.length).toBe(new Set(names).size);
    expect(groupCssTokens(tokens).every((group) => group.tokens.length > 0)).toBe(true);
  });

  it("discovers the stylesheet theme selectors without a second theme registry", () => {
    expect(extractThemeIds(widgetStyles)).toEqual(["graphite", "ocean", "sage", "sapphire"]);
  });

  it("blocks CSS values that could escape the local declaration boundary", () => {
    expect(validateCssTokenValue("oklch(0.5 0.1 240)")).toBeUndefined();
    expect(validateCssTokenValue("calc(var(--spacing) * 3)")).toBeUndefined();
    expect(validateCssTokenValue("url(https://example.com/x)")).toBeDefined();
    expect(validateCssTokenValue("red; background: black")).toBeDefined();
  });
});
