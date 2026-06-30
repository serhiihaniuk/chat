import {
  type ActivityEvent,
  CHAT_REASONING_EFFORTS,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";
import { omitUndefinedField } from "@side-chat/shared";
import { describe, expect, it } from "vitest";

import type { SideChatApiClient } from "#entities/conversation";
import { SideChatWidget } from "./side-chat-widget.js";
import {
  baseEvent,
  clickButton,
  completed,
  delta,
  fakeClient,
  installWidgetTestDom,
  mountWidget,
  started,
  submit,
  waitForText,
} from "./widget-test-env.js";

installWidgetTestDom();

describe("SideChatWidget interactions", () => {
  it("submits a message through the widget API seam and renders streaming deltas", async () => {
    const requests: ChatStreamRequest[] = [];
    const client = fakeClient(async function* (request) {
      await Promise.resolve();
      requests.push(request);
      yield started();
      yield delta("Hello ", 1);
      yield delta("from the widget", 2);
      yield completed(3);
    });

    renderWidget(client);
    await submit("hello widget");

    await waitForText("Hello from the widget");
    expect(requests[0]).toMatchObject({
      turnProfileId: "gpt-5.4-mini",
      message: { content: "hello widget" },
    });
  });

  it("shows a retryable visible error when the chat client rejects", async () => {
    const client = fakeClient(() => Promise.reject(new Error("stream exploded")));

    renderWidget(client);
    await submit("please fail");

    await waitForText("stream exploded");
    await waitForText("Try again");
    expect(document.body.textContent).toContain("Try again");
  });

  it("dispatches host-command activity through the host bridge and renders the compact activity row", async () => {
    let dispatchCount = 0;
    const dispatchCommandImpl: NonNullable<HostBridge["dispatchCommand"]> = () => {
      dispatchCount += 1;
      return Promise.resolve({
        commandId: "host-command-1",
        commandName: "open_resource",
        status: "applied",
        resultCode: "component_test_applied",
        resolvedAt: "2026-05-23T13:00:00.000Z",
      });
    };
    const client = fakeClient(async function* () {
      await Promise.resolve();
      yield started();
      yield hostCommandActivity();
      yield completed();
    });

    renderWidget(
      client,
      {
        dispatchCommand: dispatchCommandImpl,
        getContext: () =>
          Promise.resolve({
            schemaVersion: "test.host-context.v1",
            collectedAt: "2026-05-23T13:00:00.000Z",
          }),
      },
      // Detailed exposure expands the rebuilt reasoning trace while the turn streams.
      "detailed",
    );
    await submit("open record");

    await waitForText("Open resource");
    expect(dispatchCount).toBe(1);
  });

  it("cancels the live turn from the stop control", async () => {
    const cancelledTurnIds: string[] = [];
    const client: SideChatApiClient = {
      createRun: (request) =>
        Promise.resolve({
          requestId: request.requestId,
          assistantTurnId: "turn-1",
          conversationId: "conversation-1",
          status: "running",
        }),
      subscribeTurn: () => Promise.resolve({ events: neverEndingEvents() }),
      resolveRun: () => Promise.resolve({ assistantTurnId: "turn-1", status: "running" }),
      getTurnStatus: () =>
        Promise.resolve({
          assistantTurnId: "turn-1",
          conversationId: "conversation-1",
          requestId: "request-1",
          status: "running",
        }),
      cancelTurn: (assistantTurnId) => {
        cancelledTurnIds.push(assistantTurnId);
        return Promise.resolve({ assistantTurnId, cancelRequested: true });
      },
    };

    renderWidget(client);
    await submit("keep streaming");
    await waitForText("keep streaming");
    // The composer swaps Send for a stop control while busy; pressing it cancels.
    await clickButton("Send");

    expect(cancelledTurnIds).toEqual(["turn-1"]);
  });

  it("lets a host own open state and suppress the internal launcher", async () => {
    const requestedOpenStates: boolean[] = [];
    const client = fakeClient(async function* () {
      await Promise.resolve();
      yield started();
      yield completed();
    });
    const renderControlled = (open: boolean) =>
      mountWidget(
        <SideChatWidget
          client={client}
          labels={{ placeholder: "Message", send: "Send", title: "Workspace Assistant" }}
          onOpenChange={(nextOpen) => requestedOpenStates.push(nextOpen)}
          open={open}
          renderClosedLauncher={false}
        />,
      );

    renderControlled(false);
    expect(document.body.textContent).not.toContain("Workspace Assistant");
    expect(document.querySelector("button")).toBeNull();

    renderControlled(true);
    await waitForText("Workspace Assistant");
    await clickButton("Close");

    expect(requestedOpenStates).toEqual([false]);
    expect(document.body.textContent).toContain("Workspace Assistant");
  });

  it("submits a widget-supported reasoning effort from the backend catalog", async () => {
    const requests: ChatStreamRequest[] = [];
    const client = fakeClient(
      async function* (request) {
        await Promise.resolve();
        requests.push(request);
        yield started();
        yield completed();
      },
      {
        listModels: () =>
          Promise.resolve({
            defaultModel: { providerId: "openai", modelId: "gpt-5.4-mini" },
            models: [
              {
                providerId: "openai",
                modelId: "gpt-5.4-mini",
                displayName: "GPT-5.4 mini",
                contextWindowTokens: 400_000,
                maxOutputTokens: 128_000,
                default: true,
                available: true,
                reasoning: {
                  defaultEffort: CHAT_REASONING_EFFORTS.XHIGH,
                  efforts: Object.values(CHAT_REASONING_EFFORTS),
                },
              },
              {
                providerId: "openai",
                modelId: "gpt-5.5-mini",
                displayName: "GPT-5.5 mini",
                contextWindowTokens: 1_000_000,
                default: false,
                available: true,
                reasoning: {
                  defaultEffort: CHAT_REASONING_EFFORTS.XHIGH,
                  efforts: Object.values(CHAT_REASONING_EFFORTS),
                },
              },
            ],
          }),
      },
    );

    renderWidget(client);
    await waitForText("GPT-5.4 mini");
    await waitForText("Medium");
    expect(document.body.textContent).not.toContain("ctx");
    await submit("use the configured model");

    expect(requests[0]).toMatchObject({
      model: {
        providerId: "openai",
        modelId: "gpt-5.4-mini",
        reasoningEffort: CHAT_REASONING_EFFORTS.MEDIUM,
      },
      message: { content: "use the configured model" },
    });
  });

});

const renderWidget = (
  client: SideChatApiClient,
  hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand">,
  reasoningVisibility?: "minimal" | "detailed",
) =>
  mountWidget(
    <SideChatWidget
      turnProfiles={[{ id: "gpt-5.4-mini", label: "GPT-5.4 mini" }]}
      client={client}
      defaultTurnProfileId="gpt-5.4-mini"
      labels={{ placeholder: "Message", send: "Send", title: "Workspace Assistant" }}
      {...omitUndefinedField("hostBridge", hostBridge)}
      {...omitUndefinedField("reasoningVisibility", reasoningVisibility)}
    />,
  );

const hostCommandActivity = (): ActivityEvent => ({
  ...baseEvent(1),
  type: "sidechat.activity",
  activityId: "host-command-1",
  activityKind: "host_command",
  status: "running",
  title: "Open resource",
  details: {
    hostCommand: {
      commandId: "host-command-1",
      commandName: "open_resource",
      payload: { resourceId: "record-1" },
    },
  },
});

const neverEndingEvents = async function* (): AsyncIterable<SidechatStreamEvent> {
  yield started();
  yield delta("still streaming");
  await new Promise(() => undefined);
};
