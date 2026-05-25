import type { ReactElement } from "react";

import { ConversationEmptyState } from "#shared/ai/conversation";

export const ConversationEmpty = (): ReactElement => (
  <ConversationEmptyState
    className="min-h-56 justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-500 max-[720px]:min-h-40"
    description="Ask a question about this workspace, switch models, or try a markdown-heavy prompt."
    title="How can I help?"
  />
);
