import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WidgetHostBridge } from "@side-chat/host-bridge";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { WorkflowChatClient } from "#entities/workflow-chat";
import {
  useWorkflowHostContextSelection,
  type WorkflowHostContextSelection,
} from "./side-chat-host-context-selection.js";

let windowRef: Window;
let root: Root;
let container: HTMLElement;
let queryClient: QueryClient;

beforeEach(() => {
  windowRef = new Window();
  assignGlobal("window", windowRef);
  assignGlobal("document", windowRef.document);
  assignGlobal("Element", windowRef.Element);
  assignGlobal("HTMLElement", windowRef.HTMLElement);
  assignGlobal("Node", windowRef.Node);
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  windowRef.close();
});

describe("useWorkflowHostContextSelection", () => {
  it("defaults off and stays off after either availability prerequisite disappears", async () => {
    const current: { value: WorkflowHostContextSelection | undefined } = { value: undefined };
    const client = capabilityClient(true);
    const contextBridge: WidgetHostBridge = {
      getContext: () => Promise.resolve({ schemaVersion: "test.host-context.v1" }),
    };

    renderSelection(current, client, contextBridge);
    await waitFor(() => current.value?.available === true);
    expect(current.value?.enabled).toBe(false);

    act(() => current.value?.toggle());
    expect(current.value?.enabled).toBe(true);

    renderSelection(current, client, undefined);
    await waitFor(() => current.value?.available === false && current.value.enabled === false);

    renderSelection(current, client, contextBridge);
    await waitFor(() => current.value?.available === true);
    expect(current.value?.enabled).toBe(false);
  });

  it("stays unavailable when the authenticated service gate is disabled", async () => {
    const current: { value: WorkflowHostContextSelection | undefined } = { value: undefined };
    const contextBridge: WidgetHostBridge = {
      getContext: () => Promise.resolve({ schemaVersion: "test.host-context.v1" }),
    };

    renderSelection(current, capabilityClient(false), contextBridge);
    await waitFor(() => current.value !== undefined);

    expect(current.value?.available).toBe(false);
    act(() => current.value?.toggle());
    expect(current.value?.enabled).toBe(false);
  });
});

function renderSelection(
  current: { value: WorkflowHostContextSelection | undefined },
  client: WorkflowChatClient,
  hostBridge: WidgetHostBridge | undefined,
): void {
  const Probe = () => {
    current.value = useWorkflowHostContextSelection(client, hostBridge);
    return null;
  };
  act(() =>
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe))),
  );
}

function capabilityClient(enabled: boolean): WorkflowChatClient {
  return {
    baseUrl: "https://service.example",
    fetch: () => Promise.resolve(Response.json({ hostContext: { enabled } })),
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await act(async () => Promise.resolve());
  }
  throw new Error("Timed out waiting for host-context selection state.");
}

function assignGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
}
