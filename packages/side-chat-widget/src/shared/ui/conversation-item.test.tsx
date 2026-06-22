import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConversationItem } from "./conversation-item.js";

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

describe("ConversationItem", () => {
  it("shows a pulsing generating indicator when the conversation has a live turn", () => {
    act(() =>
      root.render(createElement(ConversationItem, { title: "Chat", when: "now", running: true })),
    );

    const indicator = container.querySelector('[aria-label="Generating"]');
    expect(indicator).not.toBeNull();
    expect(indicator?.className).toContain("animate-pulse");
  });

  it("shows no generating indicator when the conversation has no live turn", () => {
    act(() =>
      root.render(createElement(ConversationItem, { title: "Chat", when: "now", running: false })),
    );

    expect(container.querySelector('[aria-label="Generating"]')).toBeNull();
  });
});
