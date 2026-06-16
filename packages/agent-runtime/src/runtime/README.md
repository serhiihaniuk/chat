# Runtime Folder

Read this when: editing runtime orchestration, request validation, turn
preparation, or the private AI SDK adapter.
Source of truth for: local folder responsibilities inside `agent-runtime`.
Not source of truth for: product policy or browser protocol.

## Folder Lanes

| Path               | Owns                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| `agent-runtime.ts` | Entry point that implements the neutral `AiRuntimePort`.                          |
| `basic-agent/`     | Minimal constructor for model-only auxiliary jobs such as title or safety checks. |
| `turn/`            | Executor, provider/model, selected tool names, and final messages before stream.  |
| `executors/`       | AgentExecutor contract, registry, selection, and default executor wiring.         |
| `ai-sdk/`          | Private adapter that opens AI SDK ToolLoopAgent and maps provider parts.          |

## Read Path

```txt
agent-runtime.ts
-> turn/prepare-runtime-turn.ts
-> executors/executor-selection.ts
-> ai-sdk/streaming/tool-loop-agent-runner.ts
-> packages/ai-runtime-contract/src/index.ts
```

## Boundary Rules

- `turn/` must not import AI SDK. It only decides what will be sent.
- Shared request, event, stream, and error contracts come from
  `@side-chat/ai-runtime-contract`.
- `executors/` must resolve registered execution engines before streaming.
- `ai-sdk/` must not decide product policy. It only runs the prepared request.
- The native runtime path is `streamEffect`.
- Basic runtime agents are wrappers over `streamEffect`. They do not own prompt
  wording, product lifecycle, persistence, or provider-native behavior.
- Transport adapters may convert streams at their own edges.
- Expected failures use Effect's error channel; raw `throw` is a defect.

## Canonical Docs

- `packages/agent-runtime/README.md`
- `docs/architecture/runtime-and-protocol-events.md`
- `docs/architecture/package-boundaries.md`
