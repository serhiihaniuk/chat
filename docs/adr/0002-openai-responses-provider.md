# ADR 0002: First Real Provider Adapter Uses OpenAI Responses

## Status

Accepted

## Context

SC-18 requires a real provider adapter behind the assistant-runtime registry while keeping the fake provider as the default test/local provider. The production system design requires provider selection through registry/configuration, explicit fallback behavior, stable runtime-event mapping, no provider-native protocol leakage, and explicit provider data-use settings before production provider calls.

Official OpenAI documentation describes the Responses endpoint as `POST https://api.openai.com/v1/responses`, supports `stream: true`, and emits typed server-sent streaming events such as `response.output_text.delta`, `response.completed`, and `error`.

References:

- https://platform.openai.com/docs/api-reference/responses/retrieve
- https://platform.openai.com/docs/guides/streaming-responses
- https://platform.openai.com/docs/api-reference/responses-streaming/response/output_text

## Decision

Use OpenAI Responses as the first accepted real provider adapter.

Implementation constraints:

- The adapter lives inside `packages/assistant-runtime` and implements `AssistantProvider`.
- The adapter uses `fetch` directly and remains dependency-free for the scaffold.
- The adapter maps OpenAI streaming events into internal `RuntimeEvent` values only.
- The adapter is selected only through the existing provider registry.
- The fake provider remains the default local/test provider.
- Unit tests mock `fetch`; no default test path requires OpenAI credentials or network.
- OpenAI model ids are allowlisted by adapter configuration; unsupported model fallback is not attempted.
- Requests set `store: false` by default until production data-use and retention settings are explicitly accepted.

## Consequences

The scaffold proves model-provider switching and real provider event mapping without coupling service protocol shapes to OpenAI-native payloads. Production rollout still needs secret injection, model allowlist configuration, live integration tests, provider data-use review, and operational runbooks before real traffic.
