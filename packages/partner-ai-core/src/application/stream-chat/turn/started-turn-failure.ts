import { Effect } from "effect";
import type { AuthContext } from "#domain/authority";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  STREAM_CHAT_FAILURES,
  mapPortFailure,
  type PartnerAiCoreError,
} from "#errors";
import type { StreamChatPorts } from "../stream-chat-types.js";

/**
 * Terminalize a turn record that pre-start setup already created, then re-raise
 * the original typed failure. If terminalization itself fails, that persistence
 * failure supersedes the first error because the durable turn state is unknown.
 */
export const failStartedTurnOnError = <A>(
  ports: StreamChatPorts,
  authContext: AuthContext,
  assistantTurnId: string,
  effect: Effect.Effect<A, PartnerAiCoreError>,
): Effect.Effect<A, PartnerAiCoreError> =>
  effect.pipe(
    Effect.catch((error: PartnerAiCoreError) =>
      Effect.gen(function* () {
        yield* markStartedTurnFailed(ports, authContext, assistantTurnId, error);
        return yield* Effect.fail(error);
      }),
    ),
  );

const markStartedTurnFailed = (
  ports: StreamChatPorts,
  authContext: AuthContext,
  assistantTurnId: string,
  error: PartnerAiCoreError,
): Effect.Effect<void, PartnerAiCoreError> =>
  mapPortFailure(
    ports.assistantTurns.failAssistantTurn({
      authContext,
      assistantTurnId,
      status:
        error.code === PARTNER_AI_CORE_ERROR_CODES.PERSISTENCE_FAILED
          ? "persistence_failed"
          : "provider_failed",
      errorCode: error.protocolCode,
      now: ports.clock.now(),
    }),
    STREAM_CHAT_FAILURES.PERSISTENCE,
  );
