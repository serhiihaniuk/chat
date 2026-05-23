import type {
  AssistantTurnRepositoryContract,
  ConversationRepositoryContract,
  InteractionRepositoryContract,
} from "#schema-contract";

export type SidechatRepositories = ConversationRepositoryContract &
  AssistantTurnRepositoryContract &
  InteractionRepositoryContract;
