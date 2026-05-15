import { SideChatWidget } from "@side-chat/side-chat-widget";

import { AdvisoryWorkbenchPage } from "./features/advisory-workbench/ui/AdvisoryWorkbenchPage.js";

export function App() {
  return (
    <>
      <AdvisoryWorkbenchPage />
      <SideChatWidget
        apiEndpoint="/chat/stream"
        workspaceId="demo-workspace"
        initialConversationId="demo-conversation-001"
        title="Workspace Assistant"
      />
    </>
  );
}
