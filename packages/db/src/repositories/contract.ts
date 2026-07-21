import type {
  AssistantTurnRepositoryContract,
  ConversationRepositoryContract,
  ConversationTitleRunRepositoryContract,
  InteractionRepositoryContract,
} from "#schema-contract";

/**
 * Public persistence contract consumed by service and core adapters.
 *
 * Concrete repositories keep Drizzle implementation details behind this method
 * surface. Composition owns concrete adapter selection and lifetime.
 */
export type SidechatRepositories = ConversationRepositoryContract &
  AssistantTurnRepositoryContract &
  InteractionRepositoryContract &
  ConversationTitleRunRepositoryContract;
