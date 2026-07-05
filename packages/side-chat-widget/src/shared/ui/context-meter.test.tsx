import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ContextMeter } from "./context-meter.js";

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  assignGlobal("window", windowRef);
  assignGlobal("document", windowRef.document);
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  assignGlobal("Element", windowRef.Element);
  assignGlobal("HTMLElement", windowRef.HTMLElement);
  assignGlobal("Node", windowRef.Node);
  assignGlobal("getComputedStyle", windowRef.getComputedStyle.bind(windowRef));
  assignGlobal("requestAnimationFrame", windowRef.requestAnimationFrame.bind(windowRef));
  assignGlobal("cancelAnimationFrame", windowRef.cancelAnimationFrame.bind(windowRef));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  windowRef.close();
});

const assignGlobal = (name: string, value: unknown): void => {
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
};

const renderMeter = (props: Parameters<typeof ContextMeter>[0]): void => {
  act(() => root.render(createElement(ContextMeter, props)));
};

const meter = (): HTMLElement | null => container.querySelector('[role="meter"]');

describe("ContextMeter", () => {
  it("reports real token usage as an accessible meter", () => {
    renderMeter({ usedTokens: 120_000, windowTokens: 200_000 });

    const node = meter();
    expect(node).not.toBeNull();
    expect(node?.getAttribute("aria-valuenow")).toBe("60");
    expect(node?.getAttribute("aria-valuemin")).toBe("0");
    expect(node?.getAttribute("aria-valuemax")).toBe("100");
    expect(node?.getAttribute("aria-valuetext")).toBe("120,000 / 200,000 tokens (60%)");
    expect(node?.getAttribute("aria-label")).toBe("Context used");
  });

  it("renders nothing until both usage and a positive window are known", () => {
    renderMeter({ usedTokens: 120_000, windowTokens: undefined });
    expect(meter()).toBeNull();

    renderMeter({ usedTokens: undefined, windowTokens: 200_000 });
    expect(meter()).toBeNull();

    // A zero/absent window would divide by zero into a fake value — stay hidden.
    renderMeter({ usedTokens: 120_000, windowTokens: 0 });
    expect(meter()).toBeNull();
  });

  it("clamps an over-window usage to 100% rather than overflowing the ring", () => {
    renderMeter({ usedTokens: 260_000, windowTokens: 200_000 });
    expect(meter()?.getAttribute("aria-valuenow")).toBe("100");
  });
});
