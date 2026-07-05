import { Effect } from "effect";
import type { AuthContext } from "#domain/authority";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
  STREAM_CHAT_FAILURES,
  mapPortFailure,
  type PartnerAiCoreError as PartnerAiCoreErrorType,
} from "#errors";
import type { TurnGuard, TurnGuardDecision, TurnGuardInput, TurnGuardRegistryPort } from "#ports";
import type { StreamChatInput } from "./stream-chat-types.js";
import type { ResolvedTurnPlan } from "./turn/turn-policy-plan.js";

export type RunTurnGuardsInput = {
  readonly registry: TurnGuardRegistryPort;
  readonly streamInput: StreamChatInput;
  readonly authContext: AuthContext;
  readonly turnPlan: ResolvedTurnPlan;
};

/**
 * Run the safety checks selected for this turn.
 *
 * Guards run before private context or tools are exposed. A block stops setup
 * before any browser stream opens.
 */
export const runTurnGuards = ({
  registry,
  streamInput,
  authContext,
  turnPlan,
}: RunTurnGuardsInput): Effect.Effect<readonly TurnGuardDecision[], PartnerAiCoreErrorType> =>
  Effect.gen(function* () {
    const decisions: TurnGuardDecision[] = [];
    const guardInput = createTurnGuardInput(streamInput, authContext, turnPlan);

    // Profile safety policy selects guards for this turn. Registered but
    // unselected guards must not inspect private prompt/context.
    const selectedGuards = yield* selectTurnGuards(registry, turnPlan);

    for (const guard of selectedGuards) {
      const decision = yield* mapPortFailure(
        guard.check(guardInput),
        STREAM_CHAT_FAILURES.TURN_GUARD,
      );
      decisions.push(decision);
      if (decision.kind === "block") {
        // A blocking guard is a pre-start product rejection, not a runtime error.
        return yield* Effect.fail(toBlockedTurnGuardError(decision));
      }
    }

    return decisions;
  });

const selectTurnGuards = (
  registry: TurnGuardRegistryPort,
  turnPlan: ResolvedTurnPlan,
): Effect.Effect<readonly TurnGuard[], PartnerAiCoreErrorType> => {
  const selectedGuardIds = turnPlan.profile.safetyPolicy.turnGuardIds;
  if (selectedGuardIds.length === 0) return Effect.succeed([]);

  // Missing selected guards fail closed: a profile naming a guard is a security
  // contract, not a best-effort registry lookup.
  const guardsById = new Map(registry.guards.map((guard) => [guard.guardId, guard]));
  const selectedGuards: TurnGuard[] = [];
  const missingGuardIds: string[] = [];

  for (const guardId of selectedGuardIds) {
    const guard = guardsById.get(guardId);
    if (guard) {
      selectedGuards.push(guard);
    } else {
      missingGuardIds.push(guardId);
    }
  }

  if (missingGuardIds.length === 0) return Effect.succeed(selectedGuards);

  return Effect.fail(
    new PartnerAiCoreError(
      PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
      `Turn guard ${missingGuardIds.join(", ")} is selected by profile ${
        turnPlan.profile.profileId
      } but not registered.`,
      PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
    ),
  );
};

const createTurnGuardInput = (
  input: StreamChatInput,
  authContext: AuthContext,
  turnPlan: ResolvedTurnPlan,
): TurnGuardInput => ({
  authContext,
  workspace: input.workspace,
  requestId: input.request.requestId,
  userMessage: input.request.message.content,
  hostAppId: input.hostAppId,
  profileId: turnPlan.policyDecision.profileId,
  safetyPolicyId: turnPlan.profile.safetyPolicy.policyId,
});

const toBlockedTurnGuardError = (decision: Extract<TurnGuardDecision, { kind: "block" }>) =>
  new PartnerAiCoreError(
    PARTNER_AI_CORE_ERROR_CODES.TURN_GUARD_BLOCKED,
    decision.publicReason,
    decision.errorCode,
  );
