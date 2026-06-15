# Conversation History Context Plan

## 1. Goal

Make ordinary chat continuity work by admitting prior conversation turns into
the next model request under an explicit, authorized, token-budgeted policy.

This plan covers audit gap `4.4`.

## 2. Current gap

The app can persist and fetch conversation history through:

```txt
apps/partner-ai-service/src/inbound/http/routes/chat/chat-history.ts
packages/db/src/repositories/memory/records/conversations.ts
packages/db/src/repositories/postgres-drizzle/records/conversations.ts
```

But context preparation currently builds candidates from the current message,
host context, memory, RAG, research, and tool context. Prior conversation
messages are not admitted into runtime messages or the context board.

The result is user-visible: a second turn may not know what happened in the
first turn unless the model can infer it from the current prompt.

## 3. Design choice

Choose one strategy and document it before implementation:

| Option | Shape                                       | Use when                                                            |
| ------ | ------------------------------------------- | ------------------------------------------------------------------- |
| A      | Recent history as runtime messages          | The priority is normal chat continuity and provider chat semantics. |
| B      | History summary/candidates in context board | The priority is explicit context manifests and redaction metadata.  |
| C      | Recent messages plus older summary          | The priority is continuity with bounded token growth.               |

Recommended first implementation: Option A for a small recent window, with the
manifest recording that history was admitted. Add Option C later when budget
pressure requires summarization.

## 4. Ownership

| Concern                     | Owner                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| History repository contract | `packages/db` repository contracts/adapters                                                      |
| History admission policy    | `packages/partner-ai-core` turn policy or context policy                                         |
| History retrieval/wiring    | `apps/partner-ai-service/src/composition/context-manager/**`                                     |
| Runtime message rendering   | `apps/partner-ai-service/src/composition/context-manager/rendering/runtime-message-rendering.ts` |
| Model execution             | `packages/agent-runtime` receives prepared messages only                                         |

Do not let the widget, chat client, or protocol fetch history to rebuild model
context.

## 5. Implementation sequence

1. Add history policy fields.

   Define:

   ```txt
   enabled/disabled
   max recent messages
   max tokens
   include assistant messages
   include failed/aborted turns or not
   summarization mode, if any
   ```

2. Retrieve authorized history during context preparation.

   Use repository ports after workspace/subject/conversation authority is
   proven. Exclude the current user message if it is already added separately.

3. Normalize history entries.

   Convert persisted records into a model-safe representation with role,
   content, sequence, source message id, and estimated tokens.

4. Admit history under budget.

   Start with a recent-window policy. Older messages should be dropped or
   summarized according to the chosen strategy.

5. Render into runtime input.

   If using Option A, render recent history as runtime messages before the
   current user message. If using Option B, render sections in the context board.
   If using Option C, do both with clear ordering.

6. Record manifest status.

   The prepared context manifest should say history was included or dropped and
   why, without exposing private message content unnecessarily.

7. Honor reset.

   A reset conversation call must prevent reset messages from influencing future
   turns.

## 6. Tests

Required scenarios:

```txt
[ ] second turn can use context from the first turn
[ ] reset removes old turns from future model context
[ ] history is scoped by workspace, subject, and conversation
[ ] current user message is not duplicated in runtime messages
[ ] history admission respects max message count
[ ] history admission respects token budget
[ ] failed or aborted turns follow the chosen inclusion policy
[ ] widget harness smoke demonstrates follow-up continuity
```

Likely test files:

```txt
apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
test-harness/adoption-harness/src/adoption-golden-path.test.ts
test-harness/widget-harness/e2e/widget-harness.spec.ts
```

## 7. Documentation updates

Update:

```txt
docs/architecture/assistant-turn.md
docs/domain/vocabulary.md, only if a new canonical term is introduced
docs/product/requirements.md
apps/partner-ai-service/README.md
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

Use the canonical distinction:

```txt
conversation history: prior turns in one conversation
memory: durable extracted knowledge across a configured scope
RAG: external or indexed knowledge
research: pre-answer gathering/synthesis
```

## 8. Acceptance criteria

```txt
[ ] A second turn in the same conversation can see the first turn.
[ ] Reset conversation prevents old turns from influencing future answers.
[ ] History inclusion is visible in prepared context snapshot or runtime request.
[ ] History admission is token-budgeted.
[ ] History respects auth/workspace/subject/conversation boundaries.
[ ] History behavior is covered by service-level tests and widget harness smoke.
```
