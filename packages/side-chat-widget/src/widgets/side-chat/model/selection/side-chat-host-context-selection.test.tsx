import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WidgetHostBridge } from "@side-chat/host-bridge";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { WorkflowChatClient } from "#entities/workflow-chat";
import {
  createReactDomTestHarness,
  type ReactDomTestHarness,
} from "#testing/react-dom-test-harness";
import {
  useWorkflowHostContextSelection,
  type WorkflowHostContextSelection,
} from "./side-chat-host-context-selection.js";

let harness: ReactDomTestHarness;
let queryClient: QueryClient;

beforeEach(() => {
  harness = createReactDomTestHarness();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => {
    queryClient.clear();
    // TanStack batches observer cleanup on this zero-delay scheduler boundary.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
  harness.cleanup();
});

describe("useWorkflowHostContextSelection", () => {
  it("defaults off and stays off after either availability prerequisite disappears", async () => {
    const current: { value: WorkflowHostContextSelection | undefined } = { value: undefined };
    const client = capabilityClient(true);
    const contextBridge: WidgetHostBridge = {
      getContext: () => Promise.resolve({ schemaVersion: "test.host-context.v1" }),
    };

    renderSelection(current, client, contextBridge);
    await harness.waitFor(() => current.value?.available === true);
    expect(current.value?.enabled).toBe(false);

    act(() => current.value?.toggle());
    expect(current.value?.enabled).toBe(true);

    renderSelection(current, client, undefined);
    await harness.waitFor(
      () => current.value?.available === false && current.value.enabled === false,
    );

    renderSelection(current, client, contextBridge);
    await harness.waitFor(() => current.value?.available === true);
    expect(current.value?.enabled).toBe(false);
  });

  it("stays unavailable when the authenticated service gate is disabled", async () => {
    const current: { value: WorkflowHostContextSelection | undefined } = { value: undefined };
    const contextBridge: WidgetHostBridge = {
      getContext: () => Promise.resolve({ schemaVersion: "test.host-context.v1" }),
    };

    renderSelection(current, capabilityClient(false), contextBridge);
    await harness.waitFor(() => current.value !== undefined);

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
    return createElement("output", {
      "data-available": String(current.value.available),
      "data-enabled": String(current.value.enabled),
    });
  };
  harness.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
}

function capabilityClient(enabled: boolean): WorkflowChatClient {
  return {
    baseUrl: "https://service.example",
    scopeKey: "test-scope",
    fetch: () => Promise.resolve(Response.json({ hostContext: { enabled } })),
  };
}
