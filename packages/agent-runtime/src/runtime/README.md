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
  private adapter that runs AI SDK ToolLoopAgent and maps its stream parts
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
