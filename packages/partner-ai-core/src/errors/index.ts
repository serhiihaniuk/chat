// Public error surface for `#errors`. Two cycle-free leaf modules:
// partner-ai-core-error owns the codes, the PartnerAiCoreError class, and its
// failure factories; effect-failures owns the Effect-native port-failure mapping
// (STREAM_CHAT_FAILURES, mapPortFailure, mapSyncFailure) and imports the
// primitives directly from partner-ai-core-error, so the barrel never re-enters
// a module mid-evaluation.
export * from "./partner-ai-core-error.js";
export * from "./effect-failures.js";
