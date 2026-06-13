# Runtime Folder

Read this when: editing runtime orchestration, runtime contracts, turn
preparation, or the private AI SDK adapter.
Source of truth for: local folder responsibilities inside `agent-runtime`.
Not source of truth for: product policy or browser protocol.

## Folder Lanes

| Path               | Owns                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| `agent-runtime.ts` | Entry point used by product core and server callers.                                 |
| `contract/`        | Request, event, error, and stream types that can cross the package boundary.         |
| `turn/`            | Profile, provider/model, allowed tools, and prompt messages before the model starts. |
| `ai-sdk/`          | Private adapter that opens AI SDK ToolLoopAgent and maps provider parts.             |

## Read Path

```txt
agent-runtime.ts
-> turn/prepare-runtime-turn.ts
-> ai-sdk/tool-loop-agent-runner.ts
-> contract/runtime-event.ts
```

## Boundary Rules

- `turn/` must not import AI SDK. It only decides what will be sent.
- `ai-sdk/` must not decide product policy. It only runs the prepared request.
- The native runtime path is `streamEffect`.
- Transport adapters may convert streams at their own edges.
- Expected failures use Effect's error channel; raw `throw` is a defect.

## Related Docs

- `packages/agent-runtime/README.md`
- `docs/architecture/effect-style.md`
- `docs/architecture/boundaries.md`
