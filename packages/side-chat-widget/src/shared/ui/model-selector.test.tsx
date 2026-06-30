import { Window } from "happy-dom";
import { Gauge, Sparkles } from "lucide-react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ModelSelector, type Model, type ThinkingLevel } from "./model-selector.js";

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  assignGlobal("window", windowRef);
  assignGlobal("document", windowRef.document);
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  // Base UI's Combobox touches these DOM globals even with the popup closed.
  assignGlobal("Element", windowRef.Element);
  assignGlobal("HTMLElement", windowRef.HTMLElement);
  assignGlobal("Node", windowRef.Node);
  assignGlobal("getComputedStyle", windowRef.getComputedStyle.bind(windowRef));
  assignGlobal("requestAnimationFrame", windowRef.requestAnimationFrame.bind(windowRef));
  assignGlobal("cancelAnimationFrame", windowRef.cancelAnimationFrame.bind(windowRef));
  assignGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
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

const MODELS: readonly Model[] = [
  { id: "gpt-basic", name: "GPT Basic", desc: "No reasoning", icon: createElement(Sparkles) },
];

const THINKING_LEVELS: readonly ThinkingLevel[] = [
  { id: "medium", label: "Medium", desc: "Balanced reasoning", Icon: Gauge },
];

const renderSelector = (props: Parameters<typeof ModelSelector>[0]): void => {
  act(() => root.render(createElement(ModelSelector, props)));
};

describe("ModelSelector thinking affordance", () => {
  it("shows the selected thinking level in the trigger for a reasoning model", () => {
    renderSelector({
      models: MODELS,
      value: "gpt-basic",
      thinkingLevels: THINKING_LEVELS,
      thinkingValue: "medium",
    });

    expect(container.textContent).toContain("GPT Basic");
    expect(container.textContent).toContain("/ Medium");
  });

  it("drops the thinking label when the model exposes no reasoning levels", () => {
    renderSelector({
      models: MODELS,
      value: "gpt-basic",
      thinkingLevels: [],
      thinkingValue: undefined,
    });

    // The trigger names the model but carries no "/ <level>" suffix, so a
    // non-thinking model never advertises a reasoning level it cannot use.
    expect(container.textContent).toContain("GPT Basic");
    expect(container.textContent).not.toContain("/");
    expect(container.textContent).not.toContain("Medium");
  });
});
