# Appendix B — Suggested Types and Config

This appendix collects optional snippets. Agents should adapt them to existing repo types instead of copying blindly.

## Config keys

```txt
SIDECHAT_PROFILE_ENV=local|production

SIDECHAT_HISTORY_MODE=disabled|recent_messages|recent_plus_summary
SIDECHAT_HISTORY_MAX_MESSAGES=12
SIDECHAT_HISTORY_MAX_TOKENS=4000

SIDECHAT_CONTEXT_ADMISSION_POLICY=deterministic_v1
SIDECHAT_CONTEXT_MAX_INPUT_TOKENS=24000
SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS=4000
SIDECHAT_CONTEXT_MAX_HISTORY_TOKENS=4000
SIDECHAT_CONTEXT_MAX_MEMORY_TOKENS=2000
SIDECHAT_CONTEXT_MAX_RAG_TOKENS=8000
SIDECHAT_CONTEXT_MAX_RESEARCH_TOKENS=4000

SIDECHAT_MEMORY_MODE=disabled|noop|postgres|external
SIDECHAT_MEMORY_AUTO_WRITE=disabled|propose_only|auto_apply
SIDECHAT_MEMORY_DEFAULT_SCOPE=conversation|workspace|user

SIDECHAT_RAG_MODE=disabled|noop|static|http|external
SIDECHAT_RAG_SOURCES=source-a,source-b
SIDECHAT_RAG_FAILURE_MODE=degrade|fail_turn

SIDECHAT_RESEARCH_MODE=disabled|noop|external|langgraph
SIDECHAT_RESEARCH_FAILURE_MODE=degrade|fail_turn
```

## Capability status

```ts
export type CapabilityStatus = {
  readonly capability: string;
  readonly state: "enabled" | "disabled" | "noop" | "misconfigured";
  readonly adapterId?: string;
  readonly reason?: string;
  readonly safeForProduction: boolean;
};
```

## History policy

```ts
export type HistoryAdmissionPolicy = {
  readonly mode: "disabled" | "recent_messages" | "recent_plus_summary";
  readonly maxMessages: number;
  readonly maxEstimatedTokens: number;
  readonly includeAssistantMessages: boolean;
};
```

## Context admission

```ts
export type ContextAdmissionPolicy = {
  readonly policyId: "deterministic_v1";
  readonly maxInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly maxHistoryTokens: number;
  readonly maxMemoryTokens: number;
  readonly maxRagTokens: number;
  readonly maxResearchTokens: number;
  readonly maxHostContextTokens: number;
};
```

## Memory

```ts
export type MemoryScope =
  | { readonly kind: "conversation"; readonly conversationId: string }
  | { readonly kind: "workspace"; readonly workspaceId: string }
  | { readonly kind: "user"; readonly userId: string };

export type MemoryRecord = {
  readonly memoryId: string;
  readonly scope: MemoryScope;
  readonly kind: "fact" | "preference" | "summary" | "instruction";
  readonly content: string;
  readonly confidence: number;
  readonly status: "active" | "superseded" | "deleted";
  readonly sourceConversationId?: string;
  readonly sourceMessageIds?: readonly string[];
  readonly provenance?: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

## RAG

```ts
export type RetrievalSourceManifest = {
  readonly sourceId: string;
  readonly displayName: string;
  readonly description: string;
  readonly adapterId: string;
  readonly defaultEnabled: boolean;
  readonly trustLevel: "host" | "retrieved" | "external";
  readonly redactionClass: "public" | "internal" | "confidential";
};

export type RagContextCandidate = {
  readonly candidateId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly content: string;
  readonly url?: string;
  readonly score: number;
  readonly estimatedTokens: number;
  readonly trustLevel: "retrieved" | "host" | "external";
  readonly redactionClass: "public" | "internal" | "confidential";
  readonly provenance: JsonObject;
};
```

## Research

```ts
export type ResearchAgentOutput = {
  readonly artifactId?: string;
  readonly summary: string;
  readonly sources: readonly RagContextCandidate[];
  readonly estimatedTokens: number;
  readonly provenance: JsonObject;
};
```
