import { Effect } from "effect";
import type { AuthContext } from "#domain/authority";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  PartnerAiCoreError,
  type PartnerAiCoreError as PartnerAiCoreErrorType,
} from "#errors";
import type { TurnGuardDecision, TurnGuardInput, TurnGuardRegistryPort } from "#ports";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../errors/effect-failures.js";
import type { StreamChatInput } from "../stream-chat-types.js";
import type { ResolvedTurnPlan } from "../turn/turn-policy-plan.js";

export type RunTurnGuardsInput = {
  readonly registry: TurnGuardRegistryPort;
  readonly streamInput: StreamChatInput;
  readonly authContext: AuthContext;
  readonly turnPlan: ResolvedTurnPlan;
};

export const runTurnGuards = ({
  registry,
  streamInput,
  authContext,
  turnPlan,
}: RunTurnGuardsInput): Effect.Effect<readonly TurnGuardDecision[], PartnerAiCoreErrorType> =>
  Effect.gen(function* () {
    const decisions: TurnGuardDecision[] = [];
    const guardInput = createTurnGuardInput(streamInput, authContext, turnPlan);

    for (const guard of registry.guards) {
      const decision = yield* mapPortFailure(
        guard.check(guardInput),
        STREAM_CHAT_FAILURES.TURN_GUARD,
      );
      decisions.push(decision);
      if (decision.kind === "block") {
        return yield* Effect.fail(toBlockedTurnGuardError(decision));
      }
    }

    return decisions;
  });

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
  ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
});

const toBlockedTurnGuardError = (decision: Extract<TurnGuardDecision, { kind: "block" }>) =>
  new PartnerAiCoreError(
    PARTNER_AI_CORE_ERROR_CODES.TURN_GUARD_BLOCKED,
    decision.publicReason,
    decision.errorCode,
  );
