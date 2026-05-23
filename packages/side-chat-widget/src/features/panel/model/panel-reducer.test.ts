import { describe, expect, it } from "vitest";

import { panelReducer } from "./panel-reducer.js";
import { initialPanelState } from "./panel-state.js";

describe("panelReducer", () => {
  it("toggles settings and expanded state", () => {
    const withSettings = panelReducer(initialPanelState, {
      type: "toggle_settings",
    });
    const expanded = panelReducer(withSettings, { type: "toggle_expanded" });

    expect(withSettings).toMatchObject({ settingsOpen: true });
    expect(expanded).toMatchObject({ mode: "expanded", settingsOpen: true });
    expect(panelReducer(expanded, { type: "toggle_expanded" })).toMatchObject({
      mode: "floating",
    });
  });

  it("tracks visibility and resize lifecycle", () => {
    const resizing = panelReducer(initialPanelState, {
      height: 600,
      type: "resize_changed",
      width: 480,
    });
    const idle = panelReducer(resizing, { type: "resize_committed" });
    const closed = panelReducer(initialPanelState, { type: "close" });

    expect(resizing.resize).toEqual({
      height: 600,
      status: "resizing",
      width: 480,
    });
    expect(idle.resize).toEqual({ status: "idle" });
    expect(closed).toMatchObject({
      settingsOpen: false,
      visibility: "closed",
    });
  });
});
