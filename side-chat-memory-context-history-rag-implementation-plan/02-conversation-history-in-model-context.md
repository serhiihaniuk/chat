# 02 — Conversation History in Model Context

## Goal

Make normal chat continuity work.

The audit says conversation and message persistence exist and history endpoints can fetch/reset history, but prior conversation turns are not admitted back into model context. The runtime currently receives only the current user message as a runtime message.

This is the most user-visible gap. A second turn in the same conversation should be able to use the first turn.

## Recommended design decision

Use a two-layer strategy:

```txt
MVP now:
  Render recent prior user/assistant turns as runtime messages.

Later, when needed:
  Render older history summaries as context-board candidates.
```

Why:

```txt
Recent chat continuity is best represented as messages.
Older long-running history needs summarization and budget control.
Memory must not be used as the only continuity path because memory extraction is lossy.
```

## Add history policy

Suggested type:

```ts
export type HistoryAdmissionPolicy = {
  readonly mode: "disabled" | "recent_messages" | "recent_plus_summary";
  readonly maxMessages: number;
  readonly maxEstimatedTokens: number;
  readonly includeAssistantMessages: boolean;
};
```

Source of policy:

```txt
service config default
profile/policy override
turn policy decision
context manager input
```

The policy should be visible in the prepared context snapshot or runtime request metadata.

## Retrieval flow

Target files:

```txt
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
apps/partner-ai-service/src/composition/context-manager/rendering/runtime-message-rendering.ts
packages/partner-ai-core/src/application/stream-chat/turn/prepare-stream-chat-turn.ts
packages/db/src/schema-contract/repositories.ts
packages/db/src/repositories/memory/records/conversations.ts
packages/db/src/repositories/postgres-drizzle/records/conversations.ts
```

Suggested staged flow:

```ts
const gatheredContext =
  yield *
  gatherContextSources({
    input,
    turnPlan,
    conversation,
    userMessage,
  });

const admittedHistory = admitConversationHistory({
  historyMessages: gatheredContext.historyMessages,
  policy: turnPlan.historyPolicy,
  budget: turnPlan.contextBudget,
});

const runtimeMessages = renderRuntimeMessages({
  admittedHistory,
  currentUserMessage: userMessage,
});
```

Keep the stages separate:

```txt
gather history records
filter by auth/conversation/workspace
admit under history policy
render admitted turns as runtime messages
record admission in manifest/snapshot
```

## Important invariants

```txt
[ ] Do not include the current user message twice.
[ ] Do not include turns from another conversation.
[ ] Do not include turns outside the authorized workspace/tenant.
[ ] Reset conversation prevents old turns from influencing future model calls.
[ ] History admission must be visible in a snapshot or manifest for debugging.
[ ] If history is disabled, the runtime request contains only the current turn messages.
```

## Runtime message shape

The model input should be ordered like this:

```txt
profile system message
trusted context board system message
admitted recent history messages
current user message
```

The context board should not duplicate the same recent messages unless the strategy explicitly uses context-board-only history.

## Manifest / snapshot additions

Add a lightweight section to the context manifest:

```ts
export type HistoryContextManifest = {
  readonly policyMode: "disabled" | "recent_messages" | "recent_plus_summary";
  readonly consideredMessageCount: number;
  readonly admittedMessageCount: number;
  readonly droppedMessageCount: number;
  readonly estimatedTokens: number;
};
```

No message content needs to be duplicated in diagnostics if that would leak data. The persisted context snapshot can include references or safe summaries depending on existing design.

## Tests to add

```txt
[ ] First turn persists user and assistant messages.
[ ] Second turn in same conversation includes first turn in runtime messages.
[ ] Disabled history policy sends only the current user message.
[ ] History max message limit drops older messages deterministically.
[ ] History token limit drops older/lower-priority messages deterministically.
[ ] Reset conversation prevents previous turns from entering a future runtime request.
[ ] Cross-conversation history is not admitted.
[ ] Cross-workspace/tenant history is not admitted.
[ ] Widget harness smoke proves a follow-up question can refer to the previous answer.
```

## Suggested acceptance scenario

```txt
Turn 1:
  User: "My project codename is Blue Lynx."
  Assistant: acknowledges.

Turn 2, same conversation:
  User: "What is my project codename?"
  Runtime request includes Turn 1 as admitted history.
  Model can answer "Blue Lynx" without memory/RAG.

After reset:
  User: "What is my project codename?"
  Runtime request does not include old turns.
```

This test should verify the runtime request or context manifest directly. A real-model harness can be added as smoke, but deterministic inspection is more reliable.

## Acceptance criteria

```txt
[ ] A second turn in the same conversation can see the first turn.
[ ] Reset conversation prevents old turns from influencing future answers.
[ ] History inclusion is visible in prepared context snapshot or runtime request.
[ ] History admission is token-budgeted.
[ ] History respects auth/workspace/subject/conversation boundaries.
[ ] History behavior is covered by service-level tests and widget harness smoke.
```
