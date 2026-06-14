# 4. Conversation History Context

## Goal

Make normal chat continuity work by admitting prior conversation messages into
the next model request under explicit authorization and token limits.

## Why Fourth

History context is the most visible missing behavior. It does not require full
memory extraction, RAG indexing, or research orchestration, but it does require
the status, config, and test foundation from the first three phases.

## Design Decision

Use recent conversation messages as runtime messages for the first
implementation, but keep runtime messages model-shaped: role and content only.
Record message ids, sequence, token estimates, and drop reasons in the prepared
context manifest. Add summaries later when older history needs to fit inside
tighter budgets.

This keeps conversation history distinct from memory:

```txt
conversation history: prior turns in the same conversation
memory: durable extracted knowledge across an explicit scope
RAG: external or indexed knowledge
research: pre-answer synthesis or gathering
```

## Ownership

| Concern                               | Owner                                                        |
| ------------------------------------- | ------------------------------------------------------------ |
| History context/read port decision    | `packages/partner-ai-core/src/ports/context/**`              |
| History admission policy              | `packages/partner-ai-core` turn or context policy            |
| Repository storage contracts/adapters | `packages/db`                                                |
| Service history adapter and rendering | `apps/partner-ai-service/src/composition/context-manager/**` |
| Runtime request execution             | `packages/agent-runtime`                                     |

The widget and chat client must not rebuild model context from browser history.

## Implementation Steps

1. Decide the core-owned history read/context port before DB wiring.

   The service adapter may read from repositories, but core must see a
   model-context contract such as authorized prior messages with role/content
   plus safe metadata. Do not make `packages/db` records the shape passed into
   context preparation.

2. Extend or use the existing core history config.

   Phase 2 already introduced `HistoryContextConfig` in `partner-ai-core`.
   Add only the missing fields needed for role inclusion and failed/aborted turn
   behavior, or keep those decisions in named service helpers if the core
   contract does not need to expose them yet.

   Existing base shape:

   ```ts
   export type HistoryContextConfig = {
     readonly mode: "disabled" | "recent_messages" | "recent_plus_summary";
     readonly maxMessages: number;
     readonly maxTokens: number;
   };
   ```

3. Retrieve authorized prior messages during context preparation.

   Exclude the current user message if it is already rendered separately.

4. Normalize persisted records into model-safe messages and manifest metadata.

   Runtime messages preserve role and content only. The context manifest records
   message id, sequence, estimated tokens, inclusion, and drop reason.

5. Admit history under a recent-window budget.

   Drop oldest messages first when over budget. Record dropped counts and
   reasons in the manifest.

6. Render admitted history before the current user message.

   Keep profile system instructions and trusted context board ordering intact.
   The target model input order is:

   ```txt
   profile system message
   trusted context board system message
   admitted recent history messages
   current user message
   ```

7. Honor reset.

   Reset conversation must prevent old messages from entering future model
   context.

8. Record history admission in the manifest.

   Suggested content-safe manifest shape:

   ```ts
   export type HistoryContextManifest = {
     readonly policyMode: "disabled" | "recent_messages" | "recent_plus_summary";
     readonly consideredMessageCount: number;
     readonly admittedMessageCount: number;
     readonly droppedMessageCount: number;
     readonly estimatedTokens: number;
   };
   ```

   Diagnostics do not need to duplicate message content.

## Tests

```txt
[ ] second turn can use context from the first turn
[ ] reset removes old turns from future model context
[ ] history is scoped by workspace, subject, and conversation
[ ] current user message is not duplicated
[ ] max message count is enforced
[ ] max token budget is enforced
[ ] failed or aborted turns follow the chosen policy
[ ] widget harness smoke proves a follow-up question can refer to the previous answer
```

## Deterministic Acceptance Scenario

```txt
Turn 1:
  User: "My project codename is Blue Lynx."
  Assistant: acknowledges.

Turn 2, same conversation:
  User: "What is my project codename?"
  Runtime request includes turn 1 as admitted history.

After reset:
  User: "What is my project codename?"
  Runtime request does not include old turns.
```

## Exit Criteria

```txt
[ ] Follow-up turns receive prior conversation context according to policy.
[ ] History inclusion is visible in prepared context or runtime request tests.
[ ] Reset prevents old context from influencing future answers.
[ ] History behavior is covered below browser level and by one widget smoke.
```
