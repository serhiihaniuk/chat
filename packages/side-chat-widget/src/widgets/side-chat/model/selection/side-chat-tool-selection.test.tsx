import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SideChatApiClient } from "#entities/conversation";
import { useWidgetToolSelection, type WidgetToolSelection } from "./side-chat-tool-selection.js";

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

const catalogClient = (): Pick<SideChatApiClient, "listTools"> => ({
  listTools: () =>
    Promise.resolve({
      tools: [
        {
          name: "mock_web_search",
          label: "Mock web search",
          description: "Search.",
          defaultEnabled: true,
        },
        { name: "calculator", label: "Calculator", description: "Math.", defaultEnabled: false },
      ],
    }),
});

const renderSelection = (client: Pick<SideChatApiClient, "listTools">) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const ref: { current: WidgetToolSelection | undefined } = { current: undefined };
  const Probe = () => {
    ref.current = useWidgetToolSelection({ client: client as SideChatApiClient });
    return null;
  };
  act(() => {
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
  });
  return ref;
};

// React Query batches its store notifications on a macrotask timer, so resolving
// the query needs the event loop to advance past setTimeout, not just microtasks.
const flush = async (): Promise<void> => {
  for (let tick = 0; tick < 8; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

describe("useWidgetToolSelection", () => {
  it("seeds tool toggles and the per-turn selection from the catalog defaults", async () => {
    const ref = renderSelection(catalogClient());
    await flush();

    expect(ref.current?.tools).toEqual([
      { name: "mock_web_search", label: "Mock web search", description: "Search.", enabled: true },
      { name: "calculator", label: "Calculator", description: "Math.", enabled: false },
    ]);
    expect(ref.current?.enabledToolNames).toEqual(["mock_web_search"]);
  });

  it("flips a tool on and off and recomputes the per-turn selection", async () => {
    const ref = renderSelection(catalogClient());
    await flush();

    act(() => ref.current?.toggleTool("calculator"));
    expect(ref.current?.enabledToolNames).toEqual(["mock_web_search", "calculator"]);

    act(() => ref.current?.toggleTool("mock_web_search"));
    expect(ref.current?.enabledToolNames).toEqual(["calculator"]);
  });

  it("leaves the profile default untouched when the host has no tool catalog", async () => {
    const ref = renderSelection({});
    await flush();

    expect(ref.current?.tools).toEqual([]);
    expect(ref.current?.enabledToolNames).toBeUndefined();
  });
});
