import { describe, expect, it, vi } from "vitest";

import type { TelemetryRecord } from "#application/ports/telemetry-sink";
import type { ConversationTitleStore } from "#application/ports/turn/title/conversation-title-store";

import {
  normalizeConversationTitle,
  startConversationTitleGeneration,
  type StartConversationTitleInput,
} from "./generate-conversation-title.js";

describe("conversation title generation", () => {
  it("starts only for the persisted initial exchange and writes the normalized title once", async () => {
    const harness = titleHarness();

    await startConversationTitleGeneration(harness.dependencies, titleInput());
    await vi.waitFor(() => expect(harness.preparedTitles).toEqual(["Pricing rollout risks"]));

    await startConversationTitleGeneration(harness.dependencies, titleInput());

    expect(harness.workflowInputs).toHaveLength(1);
    expect(harness.workflowInputs[0]).toMatchObject({
      modelId: "title",
      timeoutMs: 1_000,
      persistInWorkflow: false,
    });
    expect(harness.telemetry).toContainEqual({ type: "conversation.title_generated" });
    expect(harness.telemetry).toContainEqual({ type: "conversation.title_skipped" });
  });

  it("does not repeat a title write completed by the durable workflow", async () => {
    const harness = titleHarness({ persistedInWorkflow: true });

    await startConversationTitleGeneration(harness.dependencies, titleInput());
    await vi.waitFor(() =>
      expect(harness.telemetry).toContainEqual({ type: "conversation.title_generated" }),
    );

    expect(harness.workflowInputs[0]).toMatchObject({ persistInWorkflow: true });
    expect(harness.preparedTitles).toEqual([]);
  });

  it("keeps workflow rejection and telemetry failure fail-open", async () => {
    const harness = titleHarness({ workflowError: new Error("private provider failure") });
    harness.telemetryFails = true;

    await expect(
      startConversationTitleGeneration(harness.dependencies, titleInput()),
    ).resolves.toBeUndefined();
    expect(harness.preparedTitles).toEqual([]);
  });

  it("keeps a timed-out title result isolated from the completed turn", async () => {
    const harness = titleHarness({
      resultError: new DOMException("title timeout", "TimeoutError"),
    });

    await expect(
      startConversationTitleGeneration(harness.dependencies, titleInput()),
    ).resolves.toBeUndefined();
    await vi.waitFor(() =>
      expect(harness.telemetry).toContainEqual({ type: "conversation.title_error" }),
    );
    expect(harness.preparedTitles).toEqual([]);
  });

  it("preserves the legacy display-safe normalization contract", () => {
    expect(
      normalizeConversationTitle('Title: "Pricing rollout risks."', "How should we roll out?"),
    ).toBe("Pricing rollout risks");
    expect(
      normalizeConversationTitle("How should we roll out?", "How should we roll out?"),
    ).toBeUndefined();
    expect(normalizeConversationTitle("One", "Different request")).toBeUndefined();
  });
});

function titleHarness(
  options: {
    workflowError?: Error;
    resultError?: Error;
    persistedInWorkflow?: boolean;
  } = {},
) {
  const preparedTitles: string[] = [];
  const workflowInputs: unknown[] = [];
  const telemetry: TelemetryRecord[] = [];
  let title: string | undefined;
  const store: ConversationTitleStore = {
    readTitleEligibility: () =>
      Promise.resolve({
        eligible: title === undefined,
        ...(title === undefined ? {} : { existingTitle: title }),
      }),
    prepareConversationTitle: (_auth, _conversationId, titleText) => {
      if (title === undefined) {
        title = titleText;
        preparedTitles.push(titleText);
      }
      return Promise.resolve();
    },
    recordConversationTitleRun: () => Promise.resolve(),
  };
  const harness = {
    preparedTitles,
    workflowInputs,
    telemetry,
    telemetryFails: false,
    dependencies: {
      titles: store,
      persistInWorkflow: options.persistedInWorkflow === true,
      workflow: {
        start: (input: unknown) => {
          workflowInputs.push(input);
          if (options.workflowError) return Promise.reject(options.workflowError);
          return Promise.resolve({
            runId: "title-run",
            result:
              options.resultError === undefined
                ? Promise.resolve({
                    title: "Pricing rollout risks",
                    persisted: options.persistedInWorkflow === true,
                  })
                : Promise.reject(options.resultError),
          });
        },
      },
      telemetry: {
        record: (record: TelemetryRecord) => {
          if (harness.telemetryFails) return Promise.reject(new Error("telemetry unavailable"));
          telemetry.push(record);
          return Promise.resolve();
        },
      },
    },
  };
  return harness;
}

const titleInput = (): StartConversationTitleInput => ({
  auth: { workspaceId: "workspace-1", subjectId: "subject-1", issuedAt: "2026-07-11T00:00:00Z" },
  conversationId: "conversation-1",
  requestId: "request-1",
  initialUserMessageId: "message-1",
  userContent: "How should we roll out pricing?",
  assistantContent: "Start with a limited cohort and measure retention.",
  modelId: "title",
  timeoutMs: 1_000,
});
