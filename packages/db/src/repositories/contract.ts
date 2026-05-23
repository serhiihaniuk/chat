import type {
  AssistantTurnRepositoryContract,
  ConversationRepositoryContract,
  InteractionRepositoryContract,
} from "../schema-contract/index.js";

export type SidechatRepositories = ConversationRepositoryContract &
  AssistantTurnRepositoryContract &
  InteractionRepositoryContract;
