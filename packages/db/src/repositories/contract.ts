import type {
  AssistantTurnRepositoryContract,
  ConversationRepositoryContract,
  ConversationTitleRunRepositoryContract,
  InteractionRepositoryContract,
} from "#schema-contract";

export const REPOSITORY_ADAPTER_KINDS = {
  POSTGRES_DRIZZLE: "postgres-drizzle",
  CUSTOM: "custom",
} as const;

export type RepositoryAdapterKind =
  (typeof REPOSITORY_ADAPTER_KINDS)[keyof typeof REPOSITORY_ADAPTER_KINDS];

const REPOSITORY_ADAPTER_KIND_VALUES = new Set<string>(Object.values(REPOSITORY_ADAPTER_KINDS));

export const isRepositoryAdapterKind = (value: unknown): value is RepositoryAdapterKind =>
  typeof value === "string" && REPOSITORY_ADAPTER_KIND_VALUES.has(value);

/**
 * Public persistence contract consumed by service and core adapters.
 *
 * Concrete repositories keep Drizzle, memory-store, and custom implementation
 * details behind this method surface. The adapter kind is the only exported
 * identity marker so composition can choose diagnostics and reject mismatched
 * persistence config without probing optional implementation properties.
 */
export type SidechatRepositories = ConversationRepositoryContract &
  AssistantTurnRepositoryContract &
  InteractionRepositoryContract &
  ConversationTitleRunRepositoryContract & {
    readonly adapterKind: RepositoryAdapterKind;
  };
