import type { ChatClient } from "@side-chat/chat-client";
import {
  type ActivityEvent,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";
import { omitUndefinedField } from "@side-chat/shared";
import { describe, expect, it } from "vitest";

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
  it("submits a message through the chat-client seam and renders streaming deltas", async () => {
    const requests: ChatStreamRequest[] = [];
    const client = fakeClient(async function* (request) {
      await Promise.resolve();
      requests.push(request);
      yield started();
      yield delta("Hello ");
      yield delta("from the widget");
      yield completed();
    });

    renderWidget(client);
    await submit("hello widget");

    await waitForText("Hello from the widget");
    expect(requests[0]).toMatchObject({
      assistantProfileId: "gpt-5.4-mini",
      message: { content: "hello widget" },
    });
  });

  it("shows and dismisses a visible error when the chat client rejects", async () => {
    const client = fakeClient(() => Promise.reject(new Error("stream exploded")));

    renderWidget(client);
    await submit("please fail");

    await waitForText("stream exploded");
    await clickButton("Dismiss error");
    expect(document.body.textContent).not.toContain("stream exploded");
  });

  it("dispatches host-command activity through the host bridge and renders the local result", async () => {
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

    renderWidget(client, {
      dispatchCommand: dispatchCommandImpl,
      getContext: () =>
        Promise.resolve({
          schemaVersion: "test.host-context.v1",
          collectedAt: "2026-05-23T13:00:00.000Z",
        }),
    });
    await submit("open record");

    await waitForText("component_test_applied");
    expect(dispatchCount).toBe(1);
  });

  it("aborts the active request from the stop control", async () => {
    const observedSignals: AbortSignal[] = [];
    const client: ChatClient = {
      streamChat: (_request, options) => {
        if (options?.signal) observedSignals.push(options.signal);
        return Promise.resolve({
          attempt: 1,
          events: neverEndingEvents(),
        });
      },
    };

    renderWidget(client);
    await submit("keep streaming");
    await waitForText("keep streaming");
    await clickButton("Send");

    expect(observedSignals[0]?.aborted).toBe(true);
  });
});

const renderWidget = (
  client: ChatClient,
  hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand">,
) =>
  mountWidget(
    <SideChatWidget
      assistantProfiles={[{ id: "gpt-5.4-mini", label: "GPT-5.4 mini" }]}
      client={client}
      defaultAssistantProfileId="gpt-5.4-mini"
      labels={{ placeholder: "Message", send: "Send", title: "Workspace Assistant" }}
      {...omitUndefinedField("hostBridge", hostBridge)}
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
