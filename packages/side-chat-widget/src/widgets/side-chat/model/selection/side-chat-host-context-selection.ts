import { useQuery } from "@tanstack/react-query";
import type { WidgetHostBridge } from "@side-chat/host-bridge";
import { useCallback, useEffect, useState } from "react";

import {
  readWorkflowCapabilities,
  workflowChatQueryScopeKey,
  type WorkflowChatClient,
} from "#entities/workflow-chat";

const WORKFLOW_CAPABILITIES_QUERY_RESOURCE = "capabilities";

/** Mounted widget state for the explicit page-context opt-in. */
export type WorkflowHostContextSelection = Readonly<{
  available: boolean;
  enabled: boolean;
  toggle: () => void;
}>;

/**
 * Keep context opt-in above keyed chat sessions while failing closed whenever
 * either the service gate or the host collector is unavailable.
 */
export function useWorkflowHostContextSelection(
  client: WorkflowChatClient,
  hostBridge: WidgetHostBridge | undefined,
): WorkflowHostContextSelection {
  const capabilities = useQuery({
    queryKey: [...workflowChatQueryScopeKey(client), WORKFLOW_CAPABILITIES_QUERY_RESOURCE],
    queryFn: ({ signal }) => readWorkflowCapabilities(client, signal),
  });
  const available =
    capabilities.data?.hostContext.enabled === true && typeof hostBridge?.getContext === "function";
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (!available) setRequested(false);
  }, [available]);

  const toggle = useCallback(() => {
    setRequested((current) => (available ? !current : false));
  }, [available]);

  return {
    available,
    enabled: available && requested,
    toggle,
  };
}
