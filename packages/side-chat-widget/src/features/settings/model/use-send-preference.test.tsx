import { act, createElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createReactDomTestHarness,
  type ReactDomTestHarness,
} from "#testing/react-dom-test-harness";
import { useSendPreference, type SendPreferenceController } from "./use-send-preference.js";

const STORAGE_KEY = "side-chat-widget:send-preference";

let harness: ReactDomTestHarness;
let controller: SendPreferenceController | undefined;

beforeEach(() => {
  harness = createReactDomTestHarness();
  controller = undefined;
});

afterEach(() => {
  harness.cleanup();
});

// Capture the live controller from a render so the test can call its setter and read
// the next value, without pulling in a hook-testing dependency.
function Probe(): ReactElement {
  controller = useSendPreference();
  return createElement("output", null, String(controller.sendWithCtrlEnter));
}

const mountProbe = (): void => {
  harness.render(createElement(Probe));
};

describe("useSendPreference", () => {
  it("defaults to Enter-sends and persists a toggle to localStorage", () => {
    mountProbe();
    expect(controller?.sendWithCtrlEnter).toBe(false);

    act(() => controller?.setSendWithCtrlEnter(true));
    expect(controller?.sendWithCtrlEnter).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
  });

  it("restores a persisted preference on mount", () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    mountProbe();
    expect(controller?.sendWithCtrlEnter).toBe(true);
  });
});
