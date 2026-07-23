import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createReactDomTestHarness,
  type ReactDomTestHarness,
} from "#testing/react-dom-test-harness";
import { ConversationItem } from "./conversation-item.js";

let harness: ReactDomTestHarness;
let container: HTMLElement;

beforeEach(() => {
  harness = createReactDomTestHarness();
  container = harness.container;
});

afterEach(() => {
  harness.cleanup();
});

describe("ConversationItem", () => {
  it("shows a generating indicator when the conversation has a live turn", () => {
    harness.render(createElement(ConversationItem, { title: "Chat", when: "now", running: true }));

    const indicator = container.querySelector('[aria-label="Generating"]');
    expect(indicator).not.toBeNull();
  });

  it("shows no generating indicator when the conversation has no live turn", () => {
    harness.render(createElement(ConversationItem, { title: "Chat", when: "now", running: false }));

    expect(container.querySelector('[aria-label="Generating"]')).toBeNull();
  });
});
