import { useState } from "react";
import { AdvisoryWorkbenchPage } from "./features/advisory-workbench/ui/AdvisoryWorkbenchPage.js";
import {
  HostConnectedSideChatWidget,
  HostSurfaceProvider,
} from "./shared/host-surface/HostSurfaceProvider.js";
import { resolveDemoConversationId } from "./shared/session/demo-session.js";

/**
 * Host app composition root. The Workbench page owns host state; the reusable
 * widget receives only identity, transport, and the host-surface bridge.
 */
export function App() {
  const [conversationId] = useState(resolveDemoConversationId);

  return (
    <HostSurfaceProvider>
      <AdvisoryWorkbenchPage />
      <HostConnectedSideChatWidget
        identity={{
          workspaceId: "demo-workspace",
          conversationId,
        }}
        transport={{ streamUrl: "/chat/stream" }}
        title="Workspace Assistant"
      />
    </HostSurfaceProvider>
  );
}
