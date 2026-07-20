import { useState, type ReactElement } from "react";

import { ToolDetailRow } from "@side-chat/side-chat-widget/ui/activity/tool-detail";
import { Composer } from "@side-chat/side-chat-widget/ui/composer";
import { ErrorNotice } from "@side-chat/side-chat-widget/ui/error-notice";
import { MessageActions } from "@side-chat/side-chat-widget/ui/message-actions";
import { Reasoning } from "@side-chat/side-chat-widget/ui/reasoning";
import { SettingsSection } from "@side-chat/side-chat-widget/ui/settings";
import { Shell } from "@side-chat/side-chat-widget/ui/shell";

import { PREVIEW_SCENARIOS } from "./live-preview.js";

export type PreviewScenario = (typeof PREVIEW_SCENARIOS)[keyof typeof PREVIEW_SCENARIOS];

export function PreviewContent({ scenario }: { readonly scenario: PreviewScenario }): ReactElement {
  if (scenario === PREVIEW_SCENARIOS.SETTINGS) return <SettingsSection />;
  if (scenario === PREVIEW_SCENARIOS.COMPONENTS) return <ComponentGallery />;
  return <Shell />;
}

function ComponentGallery(): ReactElement {
  const [reasoningOpen, setReasoningOpen] = useState(true);
  return (
    <div className="docs-component-gallery">
      <section>
        <span className="docs-gallery-label">Reasoning and tool activity</span>
        <Reasoning
          items={[
            { id: "thought-1", kind: "thought", text: "Checking the current workspace context." },
            {
              id: "tool-1",
              kind: "node",
              node: (
                <ToolDetailRow
                  defaultOpen
                  detail={{ input: { resourceId: 4821 }, result: { status: "opened" } }}
                  name="Open resource"
                  state="success"
                />
              ),
            },
          ]}
          label="Thought for 12s"
          onOpenChange={setReasoningOpen}
          open={reasoningOpen}
        />
      </section>
      <section>
        <span className="docs-gallery-label">Status and actions</span>
        <ErrorNotice message="The request could not be completed." onRetry={() => undefined} />
        <MessageActions copyText="A sample assistant response." onRetry={() => undefined} />
      </section>
      <section>
        <span className="docs-gallery-label">Composer</span>
        <Composer defaultValue="Ask about this workspace" />
      </section>
    </div>
  );
}
