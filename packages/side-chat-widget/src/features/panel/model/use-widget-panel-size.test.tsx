import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SideChatWidgetPanelSize } from "#entities/panel";
import { useWidgetPanelSize, type WidgetPanelSizeController } from "./use-widget-panel-size.js";

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowRef });
  Object.defineProperty(globalThis, "document", { configurable: true, value: windowRef.document });
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  windowRef.close();
});

const DEFAULT: SideChatWidgetPanelSize = { width: 640, height: 760 };

const renderHook = (
  defaultPanelSize: SideChatWidgetPanelSize | undefined,
  storageKey: string | undefined,
) => {
  const ref: { current: WidgetPanelSizeController | undefined } = { current: undefined };
  const Probe = () => {
    ref.current = useWidgetPanelSize({ defaultPanelSize, storageKey });
    return null;
  };
  act(() => root.render(createElement(Probe)));
  return ref;
};

describe("useWidgetPanelSize", () => {
  it("restores a stored size over the default", () => {
    window.localStorage.setItem("k", JSON.stringify({ width: 900, height: 680 }));
    const ref = renderHook(DEFAULT, "k");
    expect(ref.current?.panelSize).toEqual({ width: 900, height: 680 });
  });

  it("falls back to the default when nothing is stored", () => {
    const ref = renderHook(DEFAULT, "k");
    expect(ref.current?.panelSize).toEqual(DEFAULT);
  });

  it("ignores a malformed stored value and falls back to the default", () => {
    window.localStorage.setItem("k", "{ not json");
    const ref = renderHook(DEFAULT, "k");
    expect(ref.current?.panelSize).toEqual(DEFAULT);
  });

  it("ignores a non-positive stored size and falls back to the default", () => {
    window.localStorage.setItem("k", JSON.stringify({ width: -5, height: 680 }));
    const ref = renderHook(DEFAULT, "k");
    expect(ref.current?.panelSize).toEqual(DEFAULT);
  });

  it("persists the new size on setPanelSize", () => {
    const ref = renderHook(undefined, "k");
    act(() => ref.current?.setPanelSize({ width: 820, height: 600 }));

    expect(ref.current?.panelSize).toEqual({ width: 820, height: 600 });
    expect(JSON.parse(window.localStorage.getItem("k") ?? "null")).toEqual({
      width: 820,
      height: 600,
    });
  });
});
