import {
  CHAT_REASONING_EFFORTS,
  type ChatModelPreference,
  type ChatReasoningEffort,
} from "@side-chat/chat-protocol";
import { omitUndefinedProperties } from "@side-chat/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  useGetModelCatalog,
  type ModelCatalogOption,
  type SideChatApiClient,
} from "#entities/conversation";
import type { SideChatWidgetTurnProfile } from "./side-chat-widget.types.js";

const WIDGET_REASONING_EFFORTS = [
  CHAT_REASONING_EFFORTS.LOW,
  CHAT_REASONING_EFFORTS.MEDIUM,
  CHAT_REASONING_EFFORTS.HIGH,
] as const satisfies readonly ChatReasoningEffort[];

type WidgetModelSelectionInput = {
  readonly turnProfiles: readonly SideChatWidgetTurnProfile[];
  readonly client: SideChatApiClient;
  readonly selectedProfileId: string | undefined;
  readonly setSelectedProfileId: Dispatch<SetStateAction<string | undefined>>;
};

export type WidgetFooterModelOption = {
  readonly key: string;
  readonly label: string;
};

export const useWidgetModelSelection = ({
  turnProfiles,
  client,
  selectedProfileId,
  setSelectedProfileId,
}: WidgetModelSelectionInput) => {
  const [selectedModelKey, setSelectedModelKey] = useState<string | undefined>();
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<
    ChatReasoningEffort | undefined
  >();
  const modelCatalog = useGetModelCatalog({ client });
  const backendModels = useMemo(
    () => availableBackendModels(modelCatalog.data?.models),
    [modelCatalog.data?.models],
  );
  const selectedBackendModel = useMemo(
    () => findBackendModel(backendModels, selectedModelKey),
    [backendModels, selectedModelKey],
  );
  const footerModels = useMemo(
    () => resolveFooterModels(backendModels, turnProfiles),
    [turnProfiles, backendModels],
  );
  const selectedFooterModelKey = resolveSelectedFooterModelKey(
    backendModels,
    selectedModelKey,
    selectedProfileId,
  );
  const selectedFooterModel = findFooterModel(footerModels, selectedFooterModelKey);

  useEffect(() => {
    if (hasSelectedBackendModel(backendModels, selectedBackendModel)) return;
    setSelectedModelKey(resolveDefaultModelKey(modelCatalog.data?.defaultModel, backendModels));
  }, [backendModels, modelCatalog.data?.defaultModel, selectedBackendModel]);

  useEffect(() => {
    setSelectedReasoningEffort((currentEffort) =>
      resolveReasoningEffort(selectedBackendModel, currentEffort),
    );
  }, [selectedBackendModel]);

  const selectFooterModel = useCallback(
    (modelKey: string) => {
      if (backendModels.length > 0) {
        setSelectedModelKey(modelKey);
        return;
      }
      setSelectedProfileId(modelKey);
    },
    [backendModels.length, setSelectedProfileId],
  );

  return {
    footerModels,
    reasoningEfforts: selectableReasoningEfforts(selectedBackendModel),
    selectedFooterModelKey,
    selectedModel: toChatModelPreference(selectedBackendModel, selectedReasoningEffort),
    selectedModelLabel: selectedFooterModel?.label,
    selectedReasoningEffort,
    selectFooterModel,
    setSelectedReasoningEffort,
  };
};

const availableBackendModels = (
  models: readonly ModelCatalogOption[] | undefined,
): readonly ModelCatalogOption[] => models?.filter((model) => model.available) ?? [];

const findBackendModel = (
  models: readonly ModelCatalogOption[],
  selectedModelKey: string | undefined,
): ModelCatalogOption | undefined => models.find((model) => modelKey(model) === selectedModelKey);

const resolveFooterModels = (
  backendModels: readonly ModelCatalogOption[],
  turnProfiles: readonly SideChatWidgetTurnProfile[],
): readonly WidgetFooterModelOption[] =>
  backendModels.length > 0 ? backendModels.map(toFooterModel) : turnProfiles.map(toFallbackModel);

const resolveSelectedFooterModelKey = (
  backendModels: readonly ModelCatalogOption[],
  selectedModelKey: string | undefined,
  selectedProfileId: string | undefined,
): string | undefined => (backendModels.length > 0 ? selectedModelKey : selectedProfileId);

const findFooterModel = (
  models: readonly WidgetFooterModelOption[],
  selectedModelKey: string | undefined,
): WidgetFooterModelOption | undefined => models.find((model) => model.key === selectedModelKey);

const hasSelectedBackendModel = (
  backendModels: readonly ModelCatalogOption[],
  selectedBackendModel: ModelCatalogOption | undefined,
): boolean => backendModels.length === 0 || selectedBackendModel !== undefined;

const resolveReasoningEffort = (
  selectedBackendModel: ModelCatalogOption | undefined,
  currentEffort: ChatReasoningEffort | undefined,
): ChatReasoningEffort | undefined => {
  const selectableEfforts = selectableReasoningEfforts(selectedBackendModel);
  if (selectableEfforts.length === 0) return undefined;
  if (currentEffort && selectableEfforts.includes(currentEffort)) return currentEffort;
  const defaultEffort = selectedBackendModel?.reasoning?.defaultEffort;
  if (defaultEffort && selectableEfforts.includes(defaultEffort)) {
    return defaultEffort;
  }
  if (selectableEfforts.includes(CHAT_REASONING_EFFORTS.MEDIUM)) {
    return CHAT_REASONING_EFFORTS.MEDIUM;
  }
  return selectableEfforts[0];
};

const selectableReasoningEfforts = (
  selectedBackendModel: ModelCatalogOption | undefined,
): readonly ChatReasoningEffort[] =>
  WIDGET_REASONING_EFFORTS.filter((effort) =>
    selectedBackendModel?.reasoning?.efforts.includes(effort),
  );

const modelKey = (model: Pick<ModelCatalogOption, "providerId" | "modelId">): string =>
  `${model.providerId}/${model.modelId}`;

const toChatModelPreference = (
  model: ModelCatalogOption | undefined,
  reasoningEffort: ChatReasoningEffort | undefined,
): ChatModelPreference | undefined => {
  if (!model) return undefined;
  return omitUndefinedProperties({
    providerId: model.providerId,
    modelId: model.modelId,
    reasoningEffort,
  });
};

const toFooterModel = (model: ModelCatalogOption): WidgetFooterModelOption => ({
  key: modelKey(model),
  label: model.displayName,
});

const toFallbackModel = (profile: SideChatWidgetTurnProfile): WidgetFooterModelOption => ({
  key: profile.id,
  label: profile.label,
});

const resolveDefaultModelKey = (
  defaultModel: Pick<ModelCatalogOption, "providerId" | "modelId"> | undefined,
  models: readonly ModelCatalogOption[],
): string | undefined => {
  if (defaultModel) {
    const key = modelKey(defaultModel);
    if (models.some((model) => modelKey(model) === key)) return key;
  }
  return modelKey(models.find((model) => model.default) ?? models[0]!);
};
