import { useQuery } from "@tanstack/react-query";
import type { SideChatReasoningEffort } from "@side-chat/stream-profile";
import { useCallback, useMemo, useState } from "react";

import {
  readWorkflowModels,
  WORKFLOW_CHAT_QUERY_SCOPE,
  type WorkflowChatClient,
} from "#entities/workflow-chat";

const WORKFLOW_MODELS_QUERY = {
  RESOURCE: "models",
} as const;

const NO_REASONING_EFFORTS: readonly SideChatReasoningEffort[] = [];

/** One model row for the composer's model selector. */
export type WorkflowFooterModel = Readonly<{ key: string; label: string }>;

export type WorkflowModelSelection = Readonly<{
  footerModels: readonly WorkflowFooterModel[];
  selectedModelKey: string | undefined;
  contextWindowTokens: number | undefined;
  onModelSelect: (modelKey: string) => void;
  /** The model id to send with the next turn, or undefined to accept the service default. */
  modelPreference: string | undefined;
  reasoningEfforts: readonly SideChatReasoningEffort[];
  selectedReasoningEffort: SideChatReasoningEffort | undefined;
  setSelectedReasoningEffort: (effort: SideChatReasoningEffort) => void;
  /** The reasoning value to send with the next turn, or undefined when unsupported. */
  reasoningEffort: SideChatReasoningEffort | undefined;
}>;

/**
 * Fetch the workflow service's model catalog and track the composer selection.
 *
 * The service is single-model today, so the selector usually shows one option;
 * the chosen id rides along as `modelPreference` on the next send.
 */
export function useWorkflowModelSelection(client: WorkflowChatClient): WorkflowModelSelection {
  const [chosenModelId, setChosenModelId] = useState<string | undefined>(undefined);
  const [chosenReasoningEffort, setChosenReasoningEffort] = useState<
    SideChatReasoningEffort | undefined
  >(undefined);
  const catalog = useQuery({
    queryKey: [WORKFLOW_CHAT_QUERY_SCOPE, WORKFLOW_MODELS_QUERY.RESOURCE, client.baseUrl],
    queryFn: ({ signal }) => readWorkflowModels(client, signal),
  });
  const selectedModelKey = chosenModelId ?? catalog.data?.defaultModelId;
  const selectedModel = catalog.data?.models.find((model) => model.id === selectedModelKey);
  const reasoningEfforts = selectedModel?.reasoning?.efforts ?? NO_REASONING_EFFORTS;
  const selectedReasoningEffort = resolveSelectedReasoningEffort(
    selectedModel?.reasoning,
    chosenReasoningEffort,
  );
  const footerModels = useMemo<readonly WorkflowFooterModel[]>(
    () =>
      (catalog.data?.models ?? []).map((model) => ({
        key: model.id,
        label: model.id,
      })),
    [catalog.data],
  );
  const onModelSelect = useCallback((modelKey: string) => setChosenModelId(modelKey), []);
  const setSelectedReasoningEffort = useCallback(
    (effort: SideChatReasoningEffort) => {
      if (reasoningEfforts.includes(effort)) setChosenReasoningEffort(effort);
    },
    [reasoningEfforts],
  );
  return {
    footerModels,
    selectedModelKey,
    contextWindowTokens: selectedModel?.contextWindowTokens,
    onModelSelect,
    modelPreference: selectedModelKey,
    reasoningEfforts,
    selectedReasoningEffort,
    setSelectedReasoningEffort,
    reasoningEffort: selectedReasoningEffort,
  };
}

function resolveSelectedReasoningEffort(
  support:
    | Readonly<{
        efforts: readonly SideChatReasoningEffort[];
        defaultEffort: SideChatReasoningEffort;
      }>
    | undefined,
  chosen: SideChatReasoningEffort | undefined,
): SideChatReasoningEffort | undefined {
  if (support === undefined || support.efforts.length === 0) return undefined;
  if (chosen !== undefined && support.efforts.includes(chosen)) return chosen;
  return support.defaultEffort;
}
