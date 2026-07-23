// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createReactDomTestHarness,
  type ReactDomTestHarness,
} from "#testing/react-dom-test-harness";
import { ToolsMenu } from "./tools-menu.js";
import { SideChatWidgetRoot } from "./widget-root.js";

let harness: ReactDomTestHarness;
let container: HTMLElement;

beforeEach(() => {
  harness = createReactDomTestHarness();
  container = harness.container;
});

afterEach(() => {
  vi.restoreAllMocks();
  harness.cleanup();
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

  it("exposes checked state and toggles through the accessible menu rows", async () => {
    const toggleContext = vi.fn<() => void>();
    const toggleTool = vi.fn<(name: string) => void>();
    renderMenu({
      includeHostContext: false,
      onToggleHostContext: toggleContext,
      onToggleTool: toggleTool,
      tools: [{ name: "mock_web_search", label: "Mock web search", enabled: true }],
    });

    await openMenu();

    const contextRow = findMenuItem("Include page context");
    const toolRow = findMenuItem("Mock web search");
    expect(contextRow.getAttribute("aria-checked")).toBe("false");
    expect(toolRow.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('[role="switch"]')).toBeNull();

    act(() => contextRow.click());
    expect(toggleContext).toHaveBeenCalledTimes(1);

    act(() => toolRow.click());
    expect(toggleTool).toHaveBeenCalledWith("mock_web_search");
  });
});

function renderMenu(props: NonNullable<Parameters<typeof ToolsMenu>[0]>): void {
  harness.render(
    <SideChatWidgetRoot>
      <ToolsMenu {...props} />
    </SideChatWidgetRoot>,
  );
}

async function openMenu(): Promise<void> {
  const trigger = container.querySelector<HTMLElement>('[aria-label="Add context and tools"]');
  if (!trigger) throw new Error("Expected the tools-menu trigger.");
  await act(async () => Promise.resolve());
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  const popupOpened = harness.waitFor(
    () => container.querySelector('[data-slot="dropdown-menu-content"]') !== null,
    "The tools menu did not open.",
  );
  act(() => {
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  });
  await popupOpened;
}

function findTextElement(text: string): HTMLElement {
  const element = [...container.querySelectorAll<HTMLElement>("span")].find(
    (candidate) => candidate.textContent === text,
  );
  if (!element) throw new Error(`Expected an element with text: ${text}`);
  return element;
}

function findMenuItem(name: string): HTMLElement {
  const item = [...container.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find(
    (candidate) => candidate.textContent?.includes(name),
  );
  if (!item) throw new Error(`Expected an accessible menu item named: ${name}`);
  return item;
}
