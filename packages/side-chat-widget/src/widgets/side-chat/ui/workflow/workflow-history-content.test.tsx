import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { defaultWidgetLabels } from "#shared/lib/widget-labels";

import { selectWorkflowHistoryContent } from "./workflow-history-content.js";

describe("selectWorkflowHistoryContent", () => {
  it("preserves the mounted chat while a snapshot refetch is pending", () => {
    const session = <div>Live session</div>;

    expect(
      selectWorkflowHistoryContent({
        error: null,
        hasMountedSession: true,
        hasSnapshot: true,
        isLocalDraft: false,
        isPending: true,
        isRecoveryPending: true,
        labels: defaultWidgetLabels,
        onRetry: () => undefined,
        session,
      }),
    ).toBe(session);
  });

  it("shows visible synchronization activity while a recovery cursor is being validated", () => {
    const html = renderToStaticMarkup(
      selectWorkflowHistoryContent({
        error: null,
        hasMountedSession: false,
        hasSnapshot: false,
        isLocalDraft: false,
        isPending: true,
        isRecoveryPending: true,
        labels: defaultWidgetLabels,
        onRetry: () => undefined,
        session: <div>Session</div>,
      }),
    );

    expect(html).toContain("Thinking");
    expect(html).toContain("Preparing");
  });

  it("keeps a newly accepted live session mounted while its first state read is pending", () => {
    const session = <div>Streaming partial answer</div>;

    expect(
      selectWorkflowHistoryContent({
        error: null,
        hasMountedSession: true,
        hasSnapshot: false,
        isLocalDraft: false,
        isPending: true,
        isRecoveryPending: false,
        labels: defaultWidgetLabels,
        onRetry: () => undefined,
        session,
      }),
    ).toBe(session);
  });
});
