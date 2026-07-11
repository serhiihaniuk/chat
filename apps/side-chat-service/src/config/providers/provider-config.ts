export const PROVIDER_KINDS = {
  OPENAI: "openai",
  AZURE: "azure",
  SCRIPTED: "scripted",
} as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[keyof typeof PROVIDER_KINDS];

export const PROVIDER_KIND_VALUES = Object.values(PROVIDER_KINDS);
