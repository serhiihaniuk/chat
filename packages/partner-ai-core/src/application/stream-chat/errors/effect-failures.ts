import { Effect } from "effect";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
} from "#errors";

export type CoreFailure = {
  readonly code: ConstructorParameters<typeof PartnerAiCoreError>[0];
  readonly message: string;
  readonly protocolCode: ConstructorParameters<typeof PartnerAiCoreError>[2];
  readonly retryable?: boolean;
};

export const STREAM_CHAT_FAILURES = {
  CAPABILITY_MANIFEST: {
    code: PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
    message: "Host capability manifest resolution failed.",
    protocolCode: PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
    retryable: false,
  },
  CONTEXT: {
    code: PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
    message: "Context preparation failed.",
    protocolCode: PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
    retryable: true,
  },
  PERSISTENCE: {
    code: PARTNER_AI_CORE_ERROR_CODES.PERSISTENCE_FAILED,
    message: "Conversation persistence failed.",
    protocolCode: PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
    retryable: true,
  },
  POLICY: {
    code: PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
    message: "Policy evaluation failed.",
    protocolCode: PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
    retryable: true,
  },
  OBSERVABILITY: {
    code: PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
    message: "Stream observability failed.",
    protocolCode: PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
    retryable: true,
  },
  INVALID_RUNTIME_SEQUENCE: {
    code: PARTNER_AI_CORE_ERROR_CODES.INVALID_RUNTIME_SEQUENCE,
    message: "Runtime stream did not produce exactly one terminal event.",
    protocolCode: PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.MALFORMED_STREAM,
  },
} as const satisfies Record<string, CoreFailure>;

/**
 * Keep unknown port failures in the typed core error channel.
 *
 * Core ports may adapt databases, policy services, telemetry, or runtime
 * streams. This helper gives each boundary a stable PartnerAiCoreError without
 * letting thrown adapter values leak through the use case.
 */
export const mapPortFailure = <A>(
  effect: Effect.Effect<A, unknown>,
  failure: CoreFailure,
): Effect.Effect<A, PartnerAiCoreError> =>
  effect.pipe(Effect.mapError((error) => toPartnerAiCoreError(error, failure)));

export const mapSyncFailure = <A>(
  evaluate: () => A,
  failure: CoreFailure,
): Effect.Effect<A, PartnerAiCoreError> =>
  Effect.try({
    try: evaluate,
    catch: (error) => toPartnerAiCoreError(error, failure),
  });

const toPartnerAiCoreError = (error: unknown, failure: CoreFailure): PartnerAiCoreError => {
  if (error instanceof PartnerAiCoreError) return error;
  return new PartnerAiCoreError(
    failure.code,
    error instanceof Error ? error.message : failure.message,
    failure.protocolCode,
    failure.retryable ?? false,
  );
};
