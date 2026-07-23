import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createReactDomTestHarness,
  type ReactDomTestHarness,
} from "#testing/react-dom-test-harness";
import { ContextMeter } from "./context-meter.js";

let harness: ReactDomTestHarness;
let container: HTMLElement;

beforeEach(() => {
  harness = createReactDomTestHarness();
  container = harness.container;
});

afterEach(() => {
  harness.cleanup();
});

const renderMeter = (props: Parameters<typeof ContextMeter>[0]): void => {
  harness.render(createElement(ContextMeter, props));
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
