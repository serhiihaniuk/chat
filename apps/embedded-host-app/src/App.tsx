import { AdvisoryWorkbenchPage } from "./features/advisory-workbench/ui/AdvisoryWorkbenchPage.js";
import {
  HostConnectedSideChatWidget,
  HostSurfaceProvider,
} from "./shared/host-surface/HostSurfaceProvider.js";

/**
 * Host app composition root. The Workbench page owns host state; the reusable
 * widget receives only identity, transport, and the host-surface bridge.
 */
export function App() {
  return (
    <HostSurfaceProvider>
      <AdvisoryWorkbenchPage />
      <HostConnectedSideChatWidget
        identity={{
          workspaceId: "demo-workspace",
          conversationId: "demo-conversation-001",
        }}
        transport={{ streamUrl: "/chat/stream" }}
        title="Workspace Assistant"
      />
    </HostSurfaceProvider>
  );
}
