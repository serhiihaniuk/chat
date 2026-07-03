# AI Runtime Contract

Read this when: editing the core-to-runtime boundary, runtime event contracts,
or runtime port types.
Source of truth for: provider-neutral request, event, error, stream, and port
contracts shared by product core and runtime implementations.
Not source of truth for: executable tools, provider adapters, AI SDK parts,
prompt builders, product policy, persistence, or browser protocol events.

## Owns

- `AiRuntimeRequest`, the final execution-ready request from product core to a
  runtime implementation.
- `AiRuntimePort`, the Effect-first stream port product core calls.
- Runtime events, activity details, public runtime error codes, finish reasons,
  ids, and stream type aliases.
- `RuntimeReasoningPolicy` and `RuntimeCallSettings`, the provider-neutral
  model-tuning bags a turn may carry.
- Tool scope data that runtime may pass to app-owned executable tools after
  policy has selected tool names.

## Model call settings

`AiRuntimeRequest.callSettings` (`RuntimeCallSettings`) is an all-optional bag of
provider-neutral model parameters for one turn:

| Field             | Meaning                                                   |
| ----------------- | --------------------------------------------------------- |
| `temperature`     | Sampling temperature.                                     |
| `maxOutputTokens` | Cap on generated tokens.                                  |
| `topP`            | Nucleus-sampling cutoff.                                  |
| `stopSequences`   | Strings that end generation.                              |
| `maxToolSteps`    | Tool-loop step cap; absent uses the runtime default (20). |

These are top-level model call settings, not provider-native option names — the
runtime spreads them into the model call and turns `maxToolSteps` into the loop's
stop condition. An absent bag (or field) changes nothing. A turn truncated at the
step cap completes with the `tool_step_limit` finish reason, distinct from `stop`,
so truncation is observable rather than silent. A provider may drop a setting it
does not support (e.g. OpenAI ignores `temperature`/`topP` for reasoning models).

## Does Not Own

- Runtime tool execution, tool registries, provider/model adapters, or AI SDK
  stream-part mapping.
- Turn profile resolution, prompt rendering, context gathering, turn
  guards, host-command dispatch, or persistence.
- `sidechat.v1` browser DTOs or protocol sequence validation.

## Boundary Rules

- Keep this package provider-neutral and browser-protocol-neutral.
- Do not import OpenAI, AI SDK, Hono, React, DB, service composition, or runtime
  implementation helpers.
- `partner-ai-core` may import this package for runtime contracts, but must not
  import `@side-chat/agent-runtime`.
- `agent-runtime` implements these contracts and owns executable tools behind
  them.

## Verify

- `npm test --workspace @side-chat/ai-runtime-contract`
- `npm run typecheck --workspace @side-chat/ai-runtime-contract`
- `npm run lint:custom`
