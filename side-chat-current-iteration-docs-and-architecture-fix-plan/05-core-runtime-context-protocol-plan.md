# Core, Runtime, Context, and Protocol Refactor Plan

## 1. Goal

Refactor the main spine files so the architecture is readable and the extension seams are actually used.

Primary targets:

```txt
packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
packages/partner-ai-core/src/application/stream-chat/protocol/protocol-event-stream.ts
packages/partner-ai-core/src/application/stream-chat/protocol/protocol-terminal-lifecycle.ts
packages/agent-runtime/src/runtime/contract/**
packages/agent-runtime/src/tools/runtime-tool.ts
```

## 2. Refactor `prepareStreamChatTurn` into a true lifecycle spine

### Current issue

The function has comments and improved names, but too many stages still live inline.

### Target shape

```ts
export const prepareStreamChatTurn = (
  ports: StreamChatPorts,
  input: StreamChatInput,
): Effect.Effect<PreparedStreamChatTurn, PartnerAiCoreError> =>
  Effect.gen(function* () {
    // Prove the host app allows this subject to act in the requested workspace.
    const authContext = yield* resolveAuthorizedContext(input);

    // Create the request-level correlation used by observations and persisted records.
    const requestScope = createStreamChatRequestScope(ports, input, authContext);

    // Record that the request was received before any agent/runtime work can start.
    yield* recordReceivedStreamRequest(ports, input, requestScope);

    // Choose the profile, tools, guards, RAG sources, memory policy, and executor for this turn.
    const turnPlan = yield* resolveAllowedTurnPlan(ports, input, authContext);

    // Block unsafe prompts before private memory, RAG, tools, or the main executor are exposed.
    const guardDecisions = yield* runSelectedTurnGuards(ports, input, authContext, turnPlan);

    // Load or create only the conversation this subject may access.
    const conversation = yield* ensureAuthorizedConversation(ports, input, authContext);

    // Store the user-visible message that starts this assistant turn.
    const userMessage = yield* appendUserMessage(ports, input, authContext, conversation);

    // Create the assistant turn record that streamed runtime/protocol events attach to.
    const assistantTurn = yield* startAssistantTurnRecord(
      ports,
      input,
      requestScope,
      turnPlan,
      conversation,
    );

    // Gather host context, memory, RAG, research output, and tool context into a model-ready board.
    const preparedContext = yield* prepareAndRecordTurnContext(ports, input, {
      authContext,
      conversation,
      userMessage,
      assistantTurn,
      turnPlan,
    });

    // Mark the stream as startable after all durable pre-start setup has succeeded.
    yield* recordStartedStreamTurn(ports, input, requestScope, turnPlan, assistantTurn);

    return toPreparedStreamChatTurn({
      input,
      requestScope,
      authContext,
      turnPlan,
      guardDecisions,
      conversation,
      userMessage,
      assistantTurn,
      preparedContext,
    });
  });
```

The exact types can differ. The required quality is that the function reads like a lifecycle checklist.

### Helper rules

```txt
- helper names must be concrete, not generic handle/process/map
- each helper has one lifecycle reason to change
- persistence failure mapping stays local and named
- authority checks are not hidden inside unrelated persistence code
- comments explain why the step exists, not how TypeScript works
```

### Acceptance criteria

```txt
[ ] prepareStreamChatTurn is under about 80-110 readable lines.
[ ] no helper name hides its lifecycle stage.
[ ] pre-start failure semantics are obvious.
[ ] post-start failure handling remains tested/named.
[ ] guard/RAG/memory/executor concepts enter at visible stages.
```

## 3. Split `service-context-manager`

### Current issue

This file is the main density hotspot after the architecture rewrite. It performs many steps in one place.

### Target folder

```txt
apps/partner-ai-service/src/composition/context-manager/
├── service-context-manager.ts
├── context-profile-resolution.ts
├── context-source-gathering.ts
├── context-candidate-selection.ts
├── context-section-rendering.ts
├── context-manifest.ts
└── runtime-message-rendering.ts
```

### Target top-level flow

```ts
export const createServiceContextManager = (
  options: ServiceContextManagerOptions,
): ContextManagerPort => ({
  prepareTurnContext: (input) =>
    Effect.gen(function* () {
      // Resolve the selected profile and context policies for this turn.
      const contextProfile = yield* resolveContextProfile(input);

      // Gather all allowed context sources: host context, tools, memory, RAG, research.
      const gatheredContext = yield* gatherAllowedTurnContext(options, input, contextProfile);

      // Convert source-specific records into one comparable candidate list.
      const candidates = createContextCandidates(gatheredContext);

      // Select what is admitted to the model context. Simple include-all is valid only if named.
      const admission = selectContextCandidates(candidates, contextProfile.budget);

      // Render admitted candidates into context sections and runtime messages.
      const sections = createPreparedContextSections(admission.included);
      const manifest = createPreparedContextManifest(admission, sections);
      const runtimeMessages = createRuntimeMessages(input, sections);

      return toPreparedTurnContext({ sections, manifest, runtimeMessages, admission });
    }),
});
```

### Context admission honesty

If the implementation still includes all candidates, name it honestly:

```txt
createSimpleContextAdmission
```

and document:

```txt
This default admission includes all candidates and records their estimated tokens.
It is intentionally simple until a real budget/ranking strategy is added.
```

Do not call it advanced budget selection if no selection happens.

### Acceptance criteria

```txt
[ ] service-context-manager.ts is a short composition file.
[ ] profile resolution, gathering, selection, section rendering, manifest creation, and runtime messages are separate.
[ ] admission decision is honest: real selection or clearly named simple admission.
[ ] memory/RAG/research failures have explicit behavior.
[ ] context manifest explains included/dropped candidates without false sophistication.
```

## 4. Replace emitted-event list with protocol stream accumulator

### Current issue

`protocol-terminal-lifecycle.ts` receives all emitted protocol events as an array. This makes finalization scan all events and store the full stream.

### Target

Create a small accumulator:

```ts
export type ProtocolStreamState = {
  readonly seenStarted: boolean;
  readonly terminalEventType?: "sidechat.completed" | "sidechat.error";
  readonly terminalErrorCode?: ProtocolErrorCode;
  readonly assistantContent: string;
  readonly usage?: RuntimeUsage;
  readonly eventCount: number;
};
```

Use helpers:

```txt
createProtocolStreamState
rememberStartedEvent
rememberRuntimeMappedProtocolEvent
rememberTerminalEvent
finalizeProtocolStreamFromState
```

### Target lifecycle

```txt
emit sidechat.started
map runtime events and update ProtocolStreamState
on runtime failure, emit sidechat.error and update ProtocolStreamState
finalize from ProtocolStreamState
record completion/failure/memory writes
```

### Acceptance criteria

```txt
[ ] finalization does not require Ref<SidechatStreamEvent[]>.
[ ] accumulator stores only what finalization needs.
[ ] exactly-one-terminal rule remains explicit.
[ ] memory write candidate extraction uses accumulated assistant content.
[ ] long streams do not accumulate full event arrays only for finalization.
```

## 5. Make protocol stream segments explicit

### Current issue

`protocol-event-stream.ts` is not terrible, but it still hides state/segment creation in a nested flow.

### Target shape

```ts
export const createProtocolEventStream = (...): Stream.Stream<SidechatStreamEvent, PartnerAiCoreError> =>
  Stream.unwrap(
    Effect.map(createProtocolStreamState(ports, input, turn), (state) =>
      concatProtocolStreamSegments({
        started: createStartedProtocolSegment(ports, input, turn, state),
        runtimeEvents: createRuntimeProtocolEventSegment(ports, input, turn, state),
        finalization: createProtocolFinalizationSegment(ports, input, turn, state),
      }),
    ),
  );
```

Or an equivalent Effect/Stream-safe style if clearer.

### Acceptance criteria

```txt
[ ] top-level stream reads started -> runtime events -> finalization.
[ ] the point where runtime failures become protocol errors is visible.
[ ] protocol sequence ownership is explicit.
[ ] state updates are centralized and named.
```

## 6. Runtime contract cleanup

### Target files

```txt
packages/agent-runtime/src/runtime/contract/runtime-request.ts
packages/agent-runtime/src/runtime/contract/runtime-event.ts
packages/agent-runtime/src/tools/runtime-tool.ts
packages/agent-runtime/src/runtime/turn/prepare-runtime-turn.ts
```

### Tasks

```txt
1. Remove imports from chat-protocol in runtime contracts.
2. Add runtime-owned activity types or shared-neutral primitives.
3. Add RuntimeToolScope.
4. Pass tool scope from AgentRuntimeRequest to RuntimeToolContext.
5. Keep RuntimeEvent provider-neutral and internal.
```

### Acceptance criteria

```txt
[ ] Runtime contract files do not import chat-protocol.
[ ] RuntimeToolContext includes scope needed by enterprise tools.
[ ] AI SDK executor can still map tool parts to RuntimeEvent activity.
[ ] RuntimeEvent -> SidechatStreamEvent mapping happens only in partner-ai-core protocol mapper.
```

## 7. Runtime executor integration

### Tasks

```txt
1. Add executorId to core policy decision/profile if missing.
2. Pass executorId to AgentRuntimeRequest.
3. Ensure runtime executor selection fail-closes unknown executor.
4. Add deterministic test executor for tests/fixtures.
5. Add LangGraph adapter shape only if needed now; otherwise document target seam without adding code.
```

### Acceptance criteria

```txt
[ ] core decides executor, not model.
[ ] runtime selects executor, not protocol/widget/service route.
[ ] unknown executor does not half-open the stream.
[ ] runtime events remain provider-neutral.
```

## 8. Workflow vocabulary cleanup

### Problem

Generic `WorkflowCapability` language can make the architecture look bigger than current behavior.

### Target rule

Use the narrowest true name:

```txt
TurnGuard: validates before context/tools/main executor.
ResearchAgent: produces pre-answer context.
AgentExecutor: produces the final runtime event stream.
RuntimeTool: callable capability during execution.
HostCommand: UI action requested from the host app.
```

Only keep generic `WorkflowCapability` if there is real generic workflow behavior.

### Acceptance criteria

```txt
[ ] Docs do not imply a workflow engine exists unless it does.
[ ] Code names match current behavior.
[ ] Research/pre-answer behavior is not disguised as generic workflow.
```
