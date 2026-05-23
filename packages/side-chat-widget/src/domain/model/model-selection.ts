export type ModelOption = {
  readonly providerId: string;
  readonly modelId: string;
  readonly label: string;
};

export const defaultModelOption: ModelOption = {
  providerId: "fake",
  modelId: "fake-echo",
  label: "Fake Echo",
};
