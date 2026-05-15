import { AdvisoryWorkbenchPage } from "./features/advisory-workbench/ui/AdvisoryWorkbenchPage.js";
import {
  HostConnectedSideChatWidget,
  HostSurfaceProvider,
} from "./shared/host-surface/HostSurfaceProvider.js";

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
