# Documentation Compression Plan

## 1. Goal

Make documentation scannable, canonical, and smaller. Documentation should reduce context load for humans and AI agents. It must not become another architecture wall.

The target is not to document every detail. The target is to create a small set of canonical docs that answer:

```txt
What is this project?
What are the main terms?
What is the assistant turn lifecycle?
Where do I add tools, guards, RAG, memory, agents, host commands?
Which package owns which concept?
What must not cross boundaries?
```

## 2. Current docs problem

Current `docs/` contains too many overlapping architecture files:

```txt
docs/architecture/foundation-overview.md
docs/architecture/system-overview.md
docs/architecture/package-map.md
docs/architecture/boundaries.md
docs/architecture/capability-model.md
docs/architecture/adoption-extension-map.md
docs/architecture/assistant-turn-lifecycle.md
docs/architecture/stream-chat-flow.md
docs/domain/lifecycle.md
docs/domain/vocabulary.md
docs/product/functional-requirements.md
docs/product/non-functional-requirements.md
```

The problem is not that any one file is useless. The problem is that a reader must open many files to understand one system.

## 3. Target docs structure

Replace the current shape with this smaller canonical set:

```txt
docs/
├── README.md
├── domain/
│   └── vocabulary.md
├── architecture/
│   ├── system-map.md
│   ├── assistant-turn.md
│   ├── extension-seams.md
│   ├── package-boundaries.md
│   ├── runtime-and-protocol-events.md
│   └── widget-and-host-integration.md
├── product/
│   └── requirements.md
├── operations/
│   └── verification.md
└── adr/
    └── *.md
```

Optional docs can exist only if they are short and have a unique purpose.

## 4. Merge/delete map

### 4.1 Merge overview docs

Replace these:

```txt
docs/architecture/foundation-overview.md
docs/architecture/system-overview.md
docs/architecture/package-map.md
```

with:

```txt
docs/architecture/system-map.md
```

Target content:

```txt
- one paragraph product identity
- one diagram-style package map
- one table: package -> owns -> must not own -> first files to open
- one note: apps/partner-ai-service is deployable service composition, not demo app
```

Hard limit: 120 lines.

### 4.2 Merge boundary docs

Replace or merge:

```txt
docs/architecture/boundaries.md
package README boundary sections
```

into:

```txt
docs/architecture/package-boundaries.md
```

Target content:

```txt
- public protocol boundary
- runtime boundary
- core workflow boundary
- service adapter boundary
- widget/UI boundary
- persistence boundary
- shared primitives boundary
```

Each boundary should answer:

```txt
owns
may import
must not import
common mistakes
```

Hard limit: 160 lines.

### 4.3 Merge lifecycle docs

Replace these:

```txt
docs/architecture/assistant-turn-lifecycle.md
docs/architecture/stream-chat-flow.md
docs/domain/lifecycle.md
```

with:

```txt
docs/architecture/assistant-turn.md
```

Target content:

```txt
- request-to-stream lifecycle
- where guards run
- where memory/RAG/research run
- where executor is selected
- where runtime events become protocol events
- pre-start vs post-start failure semantics
- where memory write candidates happen
```

Hard limit: 160 lines.

### 4.4 Merge capability/extension docs

Replace these:

```txt
docs/architecture/capability-model.md
docs/architecture/adoption-extension-map.md
```

with:

```txt
docs/architecture/extension-seams.md
```

Target sections:

```txt
Tool
Host command
Turn guard
RAG retriever
Memory port
Research agent
Agent executor
Policy resolver
Observability adapter
```

Each seam should answer:

```txt
what it is
when it runs
what it receives
what it returns
where implementation lives
where contract lives
common mistake
```

Hard limit: 220 lines.

### 4.5 Keep but shrink vocabulary

Keep:

```txt
docs/domain/vocabulary.md
```

But rewrite it as a lookup, not an essay or architecture document.

Target format:

```md
# Vocabulary

## Core lifecycle

### Assistant turn

One user request plus the assistant execution and streamed result.
Used in: partner-ai-core, db, protocol events.
Do not confuse with: one model call.

### Turn plan

Per-turn decision that selects profile, tools, guards, RAG, memory, executor.
Used in: partner-ai-core.
Do not confuse with: the manifest declaring all possible capabilities.
```

Rules:

```txt
- No huge tables if they become unreadable.
- Each term max 4-6 lines.
- Link to architecture docs only when needed.
- Do not redefine package boundaries here.
- Do not define implementation details here.
```

Hard limit: 160 lines.

### 4.6 Merge requirements

Replace:

```txt
docs/product/functional-requirements.md
docs/product/non-functional-requirements.md
```

with:

```txt
docs/product/requirements.md
```

Target sections:

```txt
Functional requirements
Quality requirements
Security/privacy requirements
Adoption/extension requirements
Documentation/readability requirements
```

Hard limit: 180 lines.

### 4.7 Keep ADRs but stop duplicating ADR content elsewhere

Keep ADRs as decision history. Do not duplicate ADR explanations in every architecture doc.

Shorten or leave ADRs as-is depending on value. ADRs can be less frequently read than canonical docs.

### 4.8 Delete adapter-folder README spam

Current service adapter folders contain many tiny README files. They may be well-intentioned, but they fragment context.

Prefer one concise doc:

```txt
docs/architecture/extension-seams.md
```

and maybe one service adapter index:

```txt
apps/partner-ai-service/src/adapters/README.md
```

Delete tiny per-folder READMEs unless they contain unique operational information.

## 5. Package README rules

Package READMEs should be local orientation cards, not architecture chapters.

Target shape:

```md
# package-name

## Owns

3-5 bullets.

## Does not own

3-5 bullets.

## First files to open

3-7 file paths.

## Verify

1-3 commands or link to verification doc.

## Canonical docs

Links only. Do not repeat long architecture.
```

Hard limit: 50-70 lines per package README.

## 6. Documentation acceptance criteria

Documentation compression is done when:

```txt
[ ] docs/architecture has at most 6 core docs plus ADRs.
[ ] docs/domain/vocabulary.md is a lookup, not a wall of text.
[ ] package READMEs are local cards.
[ ] tiny adapter READMEs are merged or deleted.
[ ] no concept is explained in three different places.
[ ] every remaining doc has a unique purpose.
[ ] docs use the final architecture terms from the code.
[ ] docs do not mention old transitional names after code is renamed.
[ ] a new enterprise adopter can find where to add a tool, guard, RAG, memory, agent executor, or host command in under two minutes.
```

## 7. Anti-patterns to reject

Reject docs that look like this:

```txt
- giant term tables that no one scans
- repeated package descriptions across multiple docs
- AI-style prose that sounds correct but does not tell where to edit code
- historical notes in main architecture docs
- “current vs target” docs after the target is implemented
- README files that repeat the same vocabulary locally
```
