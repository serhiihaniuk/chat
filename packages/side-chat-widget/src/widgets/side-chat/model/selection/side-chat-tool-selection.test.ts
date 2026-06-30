import { describe, expect, it } from "vitest";

import type { ToolCatalogOption } from "#entities/conversation";
import {
  resolveToolToggles,
  selectedToolNames,
  toggleToolOverride,
} from "./side-chat-tool-selection.js";

const catalog: readonly ToolCatalogOption[] = [
  {
    name: "mock_web_search",
    label: "Mock web search",
    description: "Search.",
    defaultEnabled: true,
  },
  { name: "calculator", label: "Calculator", description: "Math.", defaultEnabled: false },
];

describe("composer tool selection state", () => {
  it("seeds each tool's on/off state from the catalog default-enabled flag", () => {
    expect(resolveToolToggles(catalog, {})).toEqual([
      { name: "mock_web_search", label: "Mock web search", description: "Search.", enabled: true },
      { name: "calculator", label: "Calculator", description: "Math.", enabled: false },
    ]);
  });

  it("lets a user override win over the catalog default", () => {
    const tools = resolveToolToggles(catalog, { mock_web_search: false, calculator: true });
    expect(tools.map((tool) => [tool.name, tool.enabled])).toEqual([
      ["mock_web_search", false],
      ["calculator", true],
    ]);
  });

  it("sends only the enabled tools as the per-turn selection", () => {
    expect(selectedToolNames(resolveToolToggles(catalog, {}))).toEqual(["mock_web_search"]);
  });

  it("sends an empty selection when the user turns every tool off", () => {
    const tools = resolveToolToggles(catalog, { mock_web_search: false });
    expect(selectedToolNames(tools)).toEqual([]);
  });

  it("sends no selection when there is no catalog, leaving the profile default untouched", () => {
    expect(selectedToolNames(resolveToolToggles(undefined, {}))).toBeUndefined();
  });

  it("flips a tool relative to its current resolved state", () => {
    expect(toggleToolOverride(catalog, {}, "calculator")).toEqual({ calculator: true });
    expect(toggleToolOverride(catalog, {}, "mock_web_search")).toEqual({ mock_web_search: false });
  });

  it("ignores a toggle for a tool that is not in the catalog", () => {
    expect(toggleToolOverride(catalog, { calculator: true }, "ghost")).toEqual({
      calculator: true,
    });
  });
});
