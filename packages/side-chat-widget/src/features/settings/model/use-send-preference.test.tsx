import { Window } from "happy-dom";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useSendPreference, type SendPreferenceController } from "./use-send-preference.js";

const STORAGE_KEY = "side-chat-widget:send-preference";

let windowRef: Window;
let root: Root;
let container: HTMLElement;
let controller: SendPreferenceController | undefined;

beforeEach(() => {
  windowRef = new Window();
  assignGlobal("window", windowRef);
  assignGlobal("document", windowRef.document);
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  controller = undefined;
});

afterEach(() => {
  act(() => root.unmount());
  windowRef.close();
});

const assignGlobal = (name: string, value: unknown): void => {
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
};

// Capture the live controller from a render so the test can call its setter and read
// the next value, without pulling in a hook-testing dependency.
function Probe(): ReactElement {
  controller = useSendPreference();
  return createElement("output", null, String(controller.sendWithCtrlEnter));
}

const mountProbe = (): void => {
  act(() => root.render(createElement(Probe)));
};

describe("useSendPreference", () => {
  it("defaults to Enter-sends and persists a toggle to localStorage", () => {
    mountProbe();
    expect(controller?.sendWithCtrlEnter).toBe(false);

    act(() => controller?.setSendWithCtrlEnter(true));
    expect(controller?.sendWithCtrlEnter).toBe(true);
    expect(windowRef.localStorage.getItem(STORAGE_KEY)).toBe("true");
  });

  it("restores a persisted preference on mount", () => {
    windowRef.localStorage.setItem(STORAGE_KEY, "true");
    mountProbe();
    expect(controller?.sendWithCtrlEnter).toBe(true);
  });
});
