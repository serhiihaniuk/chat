# Runtime Folder

This folder has four lanes:

```txt
agent-runtime.ts
  entry point used by partner-ai-core and other server callers

contract/
  request, event, error, and stream types that can cross the package boundary

turn/
  decisions made before the model stream starts:
  profile, provider/model, allowed tools, and final prompt messages

ai-sdk/
  private adapter that opens AI SDK ToolLoopAgent, executes runtime tools, and
  maps streamed AI SDK parts
```

The intended read path is:

```txt
agent-runtime.ts
  -> turn/prepare-runtime-turn.ts
  -> ai-sdk/tool-loop-agent-runner.ts
  -> contract/runtime-event.ts
```

`turn/` must not import AI SDK. It only decides what will be sent. `ai-sdk/`
must not decide product policy. It only runs the request that `turn/` produced.

The native runtime path is `streamEffect`: `agent-runtime.ts` returns an Effect
`Stream`, and `ai-sdk/tool-loop-agent-runner.ts` keeps AI SDK provider parts as
streaming values. Transport adapters may convert the stream at their edge, but
the runtime package API stays Effect-native.

Effect's error channel is for expected failures. A raw JavaScript `throw`
inside Effect code is a defect, so `agent-runtime.ts` catches defects at the
stream boundary and maps them into `AgentRuntimeError`. Inside implementation
code, use `Effect.fail`, `Effect.try`, or `Effect.tryPromise` for known failure
paths.
