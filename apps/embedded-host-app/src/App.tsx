import { useState } from "react";
import { AdvisoryWorkbenchPage } from "./features/advisory-workbench/ui/AdvisoryWorkbenchPage.js";
import {
  HostConnectedSideChatIframe,
  HostSurfaceProvider,
} from "./shared/host-surface/HostSurfaceProvider.js";
import { resolveDemoConversationId } from "./shared/session/demo-session.js";

const getAssistantIframeUrl = (conversationId: string) => {
  const baseUrl =
    import.meta.env.VITE_SIDE_CHAT_IFRAME_URL ?? "http://127.0.0.1:4173";
  const url = new URL(baseUrl, window.location.href);
  url.searchParams.set("embed", "1");
  url.searchParams.set("workspaceId", "demo-workspace");
  url.searchParams.set("conversationId", conversationId);
  url.searchParams.set("title", "Workspace Assistant");
  url.searchParams.set("parentOrigin", window.location.origin);
  return url.toString();
};

/**
 * Host app composition root. The Workbench page owns host state; the assistant
 * is loaded through an iframe and receives host context through postMessage.
 */
export function App() {
  const [conversationId] = useState(resolveDemoConversationId);
  const [assistantIframeUrl] = useState(() =>
    getAssistantIframeUrl(conversationId),
  );

  return (
    <HostSurfaceProvider>
      <AdvisoryWorkbenchPage />
      <HostConnectedSideChatIframe
        src={assistantIframeUrl}
        title="Workspace Assistant"
      />
    </HostSurfaceProvider>
  );
}
