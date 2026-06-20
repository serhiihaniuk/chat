import { Effect } from "effect";
import {
  hashHostCapabilityManifest,
  resolveTurnProfileFromManifest,
  validateHostCapabilityManifest,
  validateTurnPolicyDecision,
  type TurnProfile,
  type HostCapabilityManifest,
  type TurnPolicyDecision,
} from "#domain/capabilities";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
  type PartnerAiCoreError as PartnerAiCoreErrorType,
} from "#errors";
import { mapPolicyDenialToError } from "#policies/policy";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../errors/effect-failures.js";
import type { StreamChatInput, StreamChatPorts } from "../stream-chat-types.js";
import type { AuthContext } from "#domain/authority";

export type ResolvedTurnPlan = {
  readonly manifest: HostCapabilityManifest;
  readonly manifestHash: string;
  readonly policyDecision: TurnPolicyDecision;
  readonly profile: TurnProfile;
};

/**
 * Decide what this assistant turn is allowed to use.
 *
 * The result names the approved profile, tools, guards, context sources, and
 * executor. Runtime receives this decision; it does not choose those things
 * itself.
 */
export const resolveAllowedTurnPlan = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  authContext: AuthContext,
): Effect.Effect<ResolvedTurnPlan, PartnerAiCoreErrorType> =>
  Effect.gen(function* () {
    const manifest = yield* loadValidatedManifest(ports, input, authContext);
    const manifestHash = hashHostCapabilityManifest(manifest);
    const policyDecision = yield* resolveValidatedTurnPolicy(
      ports,
      input,
      authContext,
      manifest,
      manifestHash,
    );

    const policy = yield* mapPortFailure(
      ports.policies.evaluate({
        authContext,
        workspace: input.workspace,
        request: input.request,
        manifest,
        policyDecision,
      }),
      STREAM_CHAT_FAILURES.POLICY,
    );
    if (!policy.allowed) {
      return yield* Effect.fail(mapPolicyDenialToError(policy));
    }

    return {
      manifest,
      manifestHash,
      policyDecision,
      profile: yield* resolvePolicyProfile(manifest, policyDecision.profileId),
    };
  });

const resolveValidatedTurnPolicy = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  authContext: AuthContext,
  manifest: HostCapabilityManifest,
  manifestHash: string,
): Effect.Effect<TurnPolicyDecision, PartnerAiCoreErrorType> =>
  Effect.gen(function* () {
    const decision = yield* mapPortFailure(
      ports.turnPolicies.resolveTurnPolicy({
        authContext,
        workspace: input.workspace,
        request: input.request,
        manifest,
        manifestHash,
      }),
      STREAM_CHAT_FAILURES.POLICY,
    );
    const profile = yield* resolvePolicyProfile(manifest, decision.profileId);
    const validation = validateTurnPolicyDecision(manifest, profile, decision);
    if (validation.valid) return validation.decision;

    return yield* failCapabilityValidation(validation.issues);
  });

const loadValidatedManifest = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  authContext: AuthContext,
): Effect.Effect<HostCapabilityManifest, PartnerAiCoreErrorType> =>
  Effect.gen(function* () {
    const manifest = yield* mapPortFailure(
      ports.hostCapabilities.loadManifest({
        authContext,
        workspace: input.workspace,
        hostAppId: input.hostAppId,
      }),
      STREAM_CHAT_FAILURES.CAPABILITY_MANIFEST,
    );
    const validation = validateHostCapabilityManifest(manifest);
    if (validation.valid) return validation.manifest;

    return yield* failCapabilityValidation(validation.issues);
  });

const resolvePolicyProfile = (
  manifest: HostCapabilityManifest,
  profileId: string,
): Effect.Effect<TurnProfile, PartnerAiCoreErrorType> => {
  const resolution = resolveTurnProfileFromManifest(manifest, profileId);
  if (resolution.resolved) return Effect.succeed(resolution.profile);

  return Effect.fail(
    new PartnerAiCoreError(
      PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
      resolution.issue.message,
      PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
    ),
  );
};

const failCapabilityValidation = (
  issues: readonly { readonly message: string }[],
): Effect.Effect<never, PartnerAiCoreErrorType> =>
  Effect.fail(
    new PartnerAiCoreError(
      PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
      issues.map((issue) => issue.message).join(" "),
      PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
    ),
  );
