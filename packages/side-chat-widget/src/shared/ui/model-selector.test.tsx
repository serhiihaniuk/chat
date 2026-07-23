import { Gauge, Sparkles } from "lucide-react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createReactDomTestHarness,
  type ReactDomTestHarness,
} from "#testing/react-dom-test-harness";
import { ModelSelector, type Model, type ThinkingLevel } from "./model-selector.js";

let harness: ReactDomTestHarness;
let container: HTMLElement;

beforeEach(() => {
  harness = createReactDomTestHarness();
  container = harness.container;
});

afterEach(() => {
  harness.cleanup();
});

const MODELS: readonly Model[] = [
  { id: "gpt-basic", name: "GPT Basic", desc: "No reasoning", icon: createElement(Sparkles) },
];

const THINKING_LEVELS: readonly ThinkingLevel[] = [
  { id: "medium", label: "Medium", desc: "Balanced reasoning", Icon: Gauge },
];

const renderSelector = (props: Parameters<typeof ModelSelector>[0]): void => {
  harness.render(createElement(ModelSelector, props));
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
