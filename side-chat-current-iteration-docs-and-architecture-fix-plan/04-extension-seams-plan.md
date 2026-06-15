# Extension Seams Completion Plan

## 1. Goal

The repo now has extension seams, but they need to become complete enough that an enterprise team can add tools, guards, RAG, memory, research agents, and final answer executors without editing the wrong layer.

Every extension must answer:

```txt
Where is the contract?
Where is the implementation registered?
Who decides whether it is allowed for a turn?
When does it run in the assistant turn lifecycle?
What does it receive?
What does it return?
What must not leak across the boundary?
```

## 2. Tool seam

### Current concern

`RuntimeToolContext` does not carry enough enterprise scope. A real enterprise tool needs to know who/where it is acting for, but runtime should not import core auth types.

### Target runtime scope

Add a runtime-owned primitive scope object:

```ts
export type RuntimeToolScope = {
  readonly hostAppId: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly profileId: string;
  readonly allowedHostCommandNames?: readonly string[];
};
```

Pass it through:

```txt
TurnPolicyDecision / PreparedStreamChatTurn
-> AgentRuntimeRequest
-> RuntimeProviderRequest
-> RuntimeToolContext
```

Do not pass `AuthContext` directly to `agent-runtime` tools. Keep the scope primitive and runtime-owned.

### Tool example target

```ts
export const createJiraSearchIssuesTool = ({
  jiraClient,
}: {
  readonly jiraClient: JiraClient;
}): RuntimeTool => ({
  name: "jira.search_issues",
  description: "Search Jira issues visible to the current user/workspace.",
  inputSchema: JIRA_SEARCH_ISSUES_INPUT_SCHEMA,

  execute: (input, context) =>
    Effect.gen(function* () {
      const searchInput = yield* readJiraSearchIssuesInput(input);

      const authorizedSearch = {
        workspaceId: context.scope.workspaceId,
        subjectId: context.scope.subjectId,
        query: searchInput.query,
        limit: searchInput.limit,
      };

      const issues = yield* jiraClient.searchIssues(authorizedSearch);
      return toJiraSearchIssuesToolResult(issues);
    }),
});
```

### Acceptance criteria

```txt
[ ] RuntimeToolContext has a primitive enterprise scope.
[ ] Tools do not import core AuthContext or protocol request types.
[ ] Tool allowlist still comes from turn policy.
[ ] Tool unavailable/blocked behavior is tested.
[ ] Example tool demonstrates enterprise scope usage.
```

## 3. Host command seam

### Purpose

Host commands are not backend tools. They ask the embedding web app UI to do something.

Examples:

```txt
host.open_ticket_panel
host.highlight_document_section
host.ask_user_to_confirm_action
host.navigate_to_customer
```

### Target

Keep host command declarations in the capability manifest and render/dispatch results through browser protocol/widget/host bridge. Do not execute host commands inside `agent-runtime` as if they are backend tools.

### Acceptance criteria

```txt
[ ] Docs distinguish RuntimeTool from HostCommand.
[ ] Host command declarations are selected by policy/manifest.
[ ] Widget/host-bridge handles UI actions.
[ ] Backend runtime tools do not directly manipulate browser UI.
```

## 4. Turn guard seam

### Current concern

`TurnGuardRegistryPort` exposes all guards. The current flow can run every guard globally.

### Target

Guards should be selected by policy/profile/safety policy.

Recommended shape:

```ts
export type TurnGuardRegistryPort = {
  readonly resolveGuardsForTurn: (input: {
    readonly hostAppId: string;
    readonly profileId: string;
    readonly safetyPolicyId: string;
    readonly allowedGuardIds: readonly string[];
  }) => Effect.Effect<readonly TurnGuard[], PartnerAiCoreError>;
};
```

Or keep a list registry plus a pure selector, but the policy choice must be explicit.

### Target lifecycle

```txt
resolve allowed turn plan
resolve selected guards
run pre-context guards
if blocked, fail before memory/RAG/tools/main executor
```

### Guard example

```ts
export const createPromptSecurityGuard = ({
  classifier,
}: {
  readonly classifier: PromptSecurityClassifier;
}): TurnGuard => ({
  guardId: "prompt-security.standard",
  description:
    "Blocks prompts that attempt to exfiltrate private context or override system policy.",

  check: (input) =>
    Effect.gen(function* () {
      const decision = yield* classifier.classify({
        workspaceId: input.workspace.workspaceId,
        message: input.request.message,
      });

      return decision.blocked
        ? {
            kind: "block",
            publicReason: "This request cannot be processed safely.",
            internalReason: decision.reason,
            errorCode: "policy_blocked",
          }
        : { kind: "allow" };
    }),
});
```

### Acceptance criteria

```txt
[ ] Guards run before private memory/RAG/tool access.
[ ] Guards are selected by turn policy/safety policy, not blindly global.
[ ] Blocked result has safe public reason and internal reason.
[ ] Guard failure behavior is explicit.
[ ] Tests cover allow/block/warn/failure.
```

## 5. RAG seam

### Target

RAG is pre-model context retrieval. It normally runs before the runtime executor, not as a model tool.

Contract should remain core-owned:

```txt
RagRetrieverPort.retrieve(input) -> RagContextCandidate[]
```

RAG implementation lives in service adapters:

```txt
apps/partner-ai-service/src/adapters/rag/**
```

### Required candidate fields

```txt
candidateId
sourceId
title
content
score/provenance
estimatedTokens
trustLevel
redactionClass
metadata
```

### Acceptance criteria

```txt
[ ] RAG receives allowedSourceIds from policy.
[ ] RAG receives auth/workspace scope, not raw browser request only.
[ ] Runtime does not fetch RAG directly.
[ ] RAG candidates are mapped to context candidates in core/service context manager.
[ ] Empty RAG is valid.
[ ] Failure behavior is explicit: fail turn, degrade, or emit no context by policy.
```

## 6. Memory seam

### Target

Memory is durable user/workspace/conversation knowledge. It is not RAG.

Memory lifecycle:

```txt
pre-model: recall allowed memory candidates
post-turn: extract/record allowed memory write candidates
```

### Acceptance criteria

```txt
[ ] Memory policy modes are explicit: disabled/read/read_write.
[ ] Recall happens during context preparation.
[ ] Write candidates happen after terminal output and policy check.
[ ] No silent memory write from model output without policy.
[ ] Memory candidates include scope and provenance.
```

## 7. Research agent seam

### Purpose

A research agent gathers or synthesizes context before the main answer.

It is not the final answer executor unless explicitly selected as the executor.

### Target

```ts
export type ResearchAgentPort = {
  readonly runResearch: (
    input: ResearchAgentInput,
  ) => Effect.Effect<ResearchAgentOutput, PartnerAiCoreError>;
};
```

Output maps to:

```txt
ContextCandidate[]
WorkflowArtifact / ResearchArtifact
context manifest source entries
```

### Acceptance criteria

```txt
[ ] Research output is not directly browser protocol.
[ ] Research can be disabled by policy/profile.
[ ] Research sources are preserved in context manifest.
[ ] Research failure behavior is explicit.
[ ] Generic workflow naming is avoided unless a real workflow engine exists.
```

## 8. Agent executor seam

### Current concern

Runtime supports executor selection, but core does not clearly select executor from policy/profile.

### Target

Add an executor decision to profile/policy:

```ts
export type AssistantProfile = {
  readonly profileId: string;
  readonly displayName: string;
  readonly systemPromptId?: string;
  readonly executorId: string;
  // existing policy fields
};

export type TurnPolicyDecision = {
  readonly profileId: string;
  readonly executorId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly allowedToolNames: readonly string[];
  readonly allowedRetrievalSourceIds: readonly string[];
  readonly memoryPolicyId?: string;
  readonly safetyPolicyId: string;
};
```

Then pass:

```txt
TurnPolicyDecision.executorId
-> PreparedStreamChatTurn
-> AgentRuntimeRequest.executorId
-> agent-runtime executor selection
```

### Executor example

```ts
export const createLangGraphResearchExecutor = ({
  client,
}: {
  readonly client: LangGraphClient;
}): AgentExecutor => ({
  executorId: "langgraph.research",
  description: "Runs the LangGraph research assistant and maps its stream to RuntimeEvent values.",

  stream: (request) => createLangGraphRuntimeEventStream({ client, request }),
});
```

### Acceptance criteria

```txt
[ ] Core policy/profile selects executorId.
[ ] Runtime fail-closes unknown executorId before stream starts.
[ ] AI SDK details stay inside AI SDK executor.
[ ] LangGraph details stay inside LangGraph executor adapter.
[ ] Core/protocol/widget only see RuntimeEvent/SidechatStreamEvent.
```

## 9. Profile and system prompt resolution

### Current concern

Core profile uses `systemPromptId`; runtime profile uses `systemInstructions`. The connection is unclear.

### Target

Choose one explicit flow:

```txt
HostCapabilityManifest declares profile and systemPromptId.
Service composition resolves systemPromptId to text.
partner-ai-core includes resolved system instructions in the runtime request.
agent-runtime receives resolved instructions and does not fetch prompt storage.
```

or:

```txt
HostCapabilityManifest declares inline systemInstructions for now.
Future prompt storage can be added behind service composition.
```

### Recommendation

For early development, prefer explicit inline `systemInstructions` or a small service-level prompt resolver. Do not keep an unresolved ID and resolved text disconnected.

### Acceptance criteria

```txt
[ ] A reader can follow where system instructions come from.
[ ] Runtime receives resolved instructions, not a mysterious ID.
[ ] No duplicate profile concepts exist in core and runtime without a mapping function.
[ ] Tests cover selected profile -> runtime request instructions.
```
