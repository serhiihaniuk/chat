import type { SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { WidgetHostBridge } from "@side-chat/host-bridge";
import { describe, expect, it } from "vitest";

import { SideChatWidget } from "./side-chat-widget.js";
import { fakeClient, installWidgetTestDom, mountWidget, waitForText } from "./widget-test-env.js";
import type { SideChatWidgetLabels } from "../model/side-chat-widget.types.js";

installWidgetTestDom();

// A client whose run never emits — the widget stays on the empty state, which is
// where the covered label surfaces (greeting + chrome) all render at once. An empty
// async iterator (not a generator) keeps the "yields nothing" intent explicit.
const emptyStream = (): AsyncIterable<SidechatStreamEvent> => ({
  [Symbol.asyncIterator]: () => ({
    next: () => Promise.resolve({ done: true, value: undefined }),
  }),
});

const idleClient = () => fakeClient(() => emptyStream());

// getContext is never called from the empty state; the honesty branch keys off the
// bridge's presence, not its result.
const contextBridge: WidgetHostBridge = {
  getContext: () =>
    Promise.resolve({ schemaVersion: "test.host-context.v1", collectedAt: "2026-05-23T13:00:00Z" }),
  dispatchCommand: () => {
    throw new Error("dispatchCommand is not exercised in this test");
  },
};

describe("SideChatWidget labels", () => {
  it("renders the covered surfaces from a labels override, with no defaults left", async () => {
    const labels: SideChatWidgetLabels = {
      title: "Concierge",
      emptyStateTitle: "Comment puis-je aider ?",
      emptyStateWithoutContext: "Posez une question.",
      composerInputAria: "Écrire un message",
      headerSettings: "Réglages",
      headerClose: "Fermer",
    };
    mountWidget(<SideChatWidget client={idleClient()} labels={labels} />);
    await waitForText("Comment puis-je aider ?");

    expect(document.body.textContent).toContain("Concierge");
    expect(document.body.textContent).toContain("Posez une question.");
    expect(document.body.textContent).not.toContain("How can I help with this page?");
    expect(document.querySelector('[aria-label="Écrire un message"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Réglages"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Fermer"]')).not.toBeNull();
    // The English defaults for overridden chrome are gone.
    expect(document.querySelector('[aria-label="Settings"]')).toBeNull();
    expect(document.querySelector('[aria-label="Message"]')).toBeNull();
  });

  it("omits the page-context claim when no host bridge is present", async () => {
    mountWidget(<SideChatWidget client={idleClient()} />);
    await waitForText("Ask a question, or pick a place to start.");
    expect(document.body.textContent).not.toContain("I can see the page");
  });

  it("claims page context only when a host bridge supplies it", async () => {
    mountWidget(<SideChatWidget client={idleClient()} hostBridge={contextBridge} />);
    await waitForText("I can see the page you're viewing");
    expect(document.body.textContent).not.toContain("Ask a question, or pick a place to start.");
  });
});
