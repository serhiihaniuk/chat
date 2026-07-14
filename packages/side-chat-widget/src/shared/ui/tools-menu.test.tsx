// @vitest-environment happy-dom

import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToolsMenu } from "./tools-menu.js";
import { SideChatWidgetRoot } from "./widget-root.js";

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  assignGlobal("window", windowRef);
  assignGlobal("document", windowRef.document);
  assignGlobal("Element", windowRef.Element);
  assignGlobal("HTMLElement", windowRef.HTMLElement);
  assignGlobal("Node", windowRef.Node);
  assignGlobal("Event", windowRef.Event);
  assignGlobal("MouseEvent", windowRef.MouseEvent);
  assignGlobal("PointerEvent", windowRef.PointerEvent);
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
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  windowRef.close();
  vi.restoreAllMocks();
});

describe("ToolsMenu host context", () => {
  it("renders and toggles page context even when the server tool catalog is empty", async () => {
    const toggle = vi.fn<() => void>();
    renderMenu({
      includeHostContext: false,
      onToggleHostContext: toggle,
      onToggleTool: () => undefined,
      tools: [],
    });

    await openMenu();

    expect(container.textContent).toContain("Include page context");
    expect(container.textContent).not.toContain("No tools available");
    const contextRow = findTextElement("Include page context");
    act(() => contextRow.click());
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("omits the row when context collection is unavailable", async () => {
    renderMenu({ onToggleTool: () => undefined, tools: [] });

    await openMenu();

    expect(container.textContent).not.toContain("Include page context");
    expect(container.textContent).toContain("No tools available");
  });
});

function renderMenu(props: NonNullable<Parameters<typeof ToolsMenu>[0]>): void {
  act(() =>
    root.render(
      <SideChatWidgetRoot>
        <ToolsMenu {...props} />
      </SideChatWidgetRoot>,
    ),
  );
}

async function openMenu(): Promise<void> {
  const trigger = container.querySelector<HTMLElement>('[aria-label="Add context and tools"]');
  if (!trigger) throw new Error("Expected the tools-menu trigger.");
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  await waitFor(() => trigger.getAttribute("aria-expanded") === "false");
  act(() => {
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  await waitFor(() => container.querySelector('[data-slot="dropdown-menu-content"]') !== null);
}

function findTextElement(text: string): HTMLElement {
  const element = [...container.querySelectorAll<HTMLElement>("span")].find(
    (candidate) => candidate.textContent === text,
  );
  if (!element) throw new Error(`Expected an element with text: ${text}`);
  return element;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await act(async () => Promise.resolve());
  }
  throw new Error(`Timed out waiting for the tools menu. ${container.innerHTML}`);
}

function assignGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
}
