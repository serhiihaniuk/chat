import { describe, expect, it } from "vitest";

import { defaultWidgetLabels } from "#shared/lib/widget-labels";

import { selectWorkflowHistoryContent } from "./workflow-history-content.js";

describe("selectWorkflowHistoryContent", () => {
  it("preserves the mounted chat while its accepted draft is becoming persisted", () => {
    const session = <div>Live session</div>;

    expect(
      selectWorkflowHistoryContent({
        error: null,
        isLocalDraft: false,
        isPending: true,
        isRecoveryPending: true,
        labels: defaultWidgetLabels,
        onRetry: () => undefined,
        preserveSession: true,
        session,
      }),
    ).toBe(session);
  });
});
