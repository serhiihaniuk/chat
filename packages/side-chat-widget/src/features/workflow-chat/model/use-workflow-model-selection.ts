import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { readWorkflowModels, type WorkflowChatClient } from "#entities/workflow-chat";

const WORKFLOW_MODELS_QUERY = {
  RESOURCE: "models",
  SCOPE: "workflow-chat",
} as const;

/** One model row for the composer's model selector. */
export type WorkflowFooterModel = Readonly<{ key: string; label: string }>;

export type WorkflowModelSelection = Readonly<{
  footerModels: readonly WorkflowFooterModel[];
  selectedModelKey: string | undefined;
  contextWindowTokens: number | undefined;
  onModelSelect: (modelKey: string) => void;
  /** The model id to send with the next turn, or undefined to accept the service default. */
  modelPreference: string | undefined;
}>;

/**
 * Fetch the workflow service's model catalog and track the composer selection.
 *
 * The service is single-model today, so the selector usually shows one option;
 * the chosen id rides along as `modelPreference` on the next send.
 */
export function useWorkflowModelSelection(client: WorkflowChatClient): WorkflowModelSelection {
  const [chosenModelId, setChosenModelId] = useState<string | undefined>(undefined);
  const catalog = useQuery({
    queryKey: [WORKFLOW_MODELS_QUERY.SCOPE, WORKFLOW_MODELS_QUERY.RESOURCE, client.baseUrl],
    queryFn: ({ signal }) => readWorkflowModels(client, signal),
  });
  const selectedModelKey = chosenModelId ?? catalog.data?.defaultModelId;
  const selectedModel = catalog.data?.models.find((model) => model.id === selectedModelKey);
  const footerModels = useMemo<readonly WorkflowFooterModel[]>(
    () =>
      (catalog.data?.models ?? []).map((model) => ({
        key: model.id,
        label: model.id,
      })),
    [catalog.data],
  );
  const onModelSelect = useCallback((modelKey: string) => setChosenModelId(modelKey), []);
  return {
    footerModels,
    selectedModelKey,
    contextWindowTokens: selectedModel?.contextWindowTokens,
    onModelSelect,
    modelPreference: selectedModelKey,
  };
}
