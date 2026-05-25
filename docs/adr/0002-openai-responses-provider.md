# ADR 0002: First Real Provider Adapter Uses OpenAI Responses

## Status

Accepted

## Context

SC-18 requires a real provider adapter behind the agent-runtime provider protocol while
keeping the fake provider as an explicit deterministic test/local fixture. The
production system design requires provider selection through
configuration/policy, explicit fallback behavior, stable runtime-event mapping,
no provider-native protocol leakage, and explicit provider data-use settings
before production provider calls.

Official OpenAI documentation describes the Responses endpoint as `POST https://api.openai.com/v1/responses`, supports `stream: true`, and emits typed server-sent streaming events such as `response.output_text.delta`, `response.completed`, and `error`.

References:

- https://platform.openai.com/docs/api-reference/responses/retrieve
- https://platform.openai.com/docs/guides/streaming-responses
- https://platform.openai.com/docs/api-reference/responses-streaming/response/output_text

## Decision

Use OpenAI Responses as the first accepted real provider adapter.

Implementation constraints:

- The adapter lives inside `packages/agent-runtime` and implements `ModelProvider`.
- The adapter uses the AI SDK OpenAI provider package and exposes model handles
  to the runtime.
- AI SDK and OpenAI-native stream details remain inside `packages/agent-runtime`.
- The adapter is selected only through runtime provider/model configuration and
  product policy.
- The fake provider remains available as an explicit deterministic test/local
  provider.
- Local service mode may select OpenAI through `SIDECHAT_PROVIDER=openai`,
  `SIDECHAT_OPENAI_API_KEY`, `SIDECHAT_ALLOWED_MODELS`, and reasoning env keys.
- Unit tests mock `fetch`; no default test path requires OpenAI credentials or network.
- OpenAI model ids are allowlisted by adapter configuration; unsupported model fallback is not attempted.
- Requests set `store: false` by default until production data-use and retention settings are explicitly accepted.

## Consequences

The scaffold proves model-provider switching and real provider event mapping
without coupling service protocol shapes to OpenAI-native payloads. The current
local OpenAI smoke path uses `gpt-5.4-mini` with medium reasoning by env
configuration. Production rollout still needs secret injection, model allowlist
configuration, live integration tests, provider data-use review, and operational
runbooks before real customer traffic.
