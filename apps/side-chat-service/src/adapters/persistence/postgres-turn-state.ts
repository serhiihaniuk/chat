import { createPostgresDrizzleSidechatRepositories } from "@side-chat/db";

import { createPostgresConversationQueries } from "./postgres-turn-state/conversations/conversation-queries.js";
import { createPostgresConversationTitleStore } from "./postgres-turn-state/conversations/conversation-titles.js";
import { createPostgresTurnLifecycle } from "./postgres-turn-state/lifecycle/turn-lifecycle.js";
import type {
  ClosableRepositories,
  PostgresTurnState,
  TurnStateContext,
} from "./postgres-turn-state/types.js";
import { createPostgresClientToolDispatchStore } from "./postgres-turn-state/client-tool-dispatches.js";

export type { PostgresTurnState } from "./postgres-turn-state/types.js";

/**
 * Real Postgres persistence for the turn write/cancel path.
 *
 * Maps the service's turn ports onto `@side-chat/db` repositories. The service
 * `conversationId` is passed through as both the db `conversationId` and its
 * `conversationKey`; `actorId` is the `subjectId`.
 */
export const createPostgresTurnState = (
  connectionString: string,
): PostgresTurnState =>
  createTurnStateFromRepositories(
    createPostgresDrizzleSidechatRepositories({ connectionString }),
  );

/**
 * Build the turn store over any repositories implementation.
 *
 * The seam that lets a test drive the exact port -> db mapping and error
 * translation with a hand-written fake, without a live Postgres.
 */
export const createTurnStateFromRepositories = (
  repositories: ClosableRepositories,
): PostgresTurnState => {
  const context: TurnStateContext = { repositories, identities: new Map() };
  const queries = createPostgresConversationQueries(repositories);
  const titles = createPostgresConversationTitleStore(repositories);
  const clientToolDispatches =
    createPostgresClientToolDispatchStore(repositories);
  const lifecycle = createPostgresTurnLifecycle(context);
  return {
    ...titles,
    ...queries,
    ...clientToolDispatches,
    ...lifecycle,
    close: repositories.close,
  };
};
