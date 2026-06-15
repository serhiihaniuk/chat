# Vocabulary

Read this when: a term in code, docs, tests, comments, events, or review notes
is unclear.
Source of truth for: canonical Side Chat terms and names to avoid.
Not source of truth for: lifecycle order, package boundaries, or implementation
plans.

## Rules

- Use the canonical term in code, docs, tests, and review notes.
- Keep aliases local and intentional.
- Use `docs/architecture/package-boundaries.md` for boundary rules.
- Use `docs/architecture/assistant-turn.md` for lifecycle order.
- Rename docs/tests/comments in the same patch when a term changes.

## Product Shape

- **Side Chat**: the adoptable enterprise assistant foundation owned by this
  repo. Avoid generic chat app, demo app, or plugin framework.
- **Adoptable assistant foundation**: ownable repo shape an enterprise team can
  deploy and extend with app-specific assistant capabilities.
- **Host app**: consuming web app that embeds Side Chat and owns business UI,
  auth, domain entities, and host-specific permissions.
- **Embedding surface**: host-app page, dashboard, portal, or internal tool
  where Side Chat is embedded.

## Core Lifecycle

- **Workspace**: authorized product scope for a request. Avoid tenant unless the
  local code is actually tenant-shaped.
- **Project**: optional product scope associated with a conversation or request.
- **Conversation**: durable chat thread containing user messages and assistant
  turns. Use thread only in local UI wording.
- **Conversation title**: durable display label generated once after the first
  successful exchange when service config enables title generation. It is not a
  browser protocol event or a user-authored message.
- **User message**: user-submitted message persisted and displayed in a
  conversation. Avoid broad input or prompt.
- **Assistant turn**: one assistant response lifecycle attached to a user
  message. Do not confuse it with one model call.
- **Stream chat turn**: product workflow that prepares and streams one assistant
  turn.
- **Turn plan**: per-turn decision selecting profile, model, tools, commands,
  RAG, memory, research, guards, approvals, executor id, and instructions.
- **Prepared context**: context snapshot/messages prepared before runtime
  execution. Do not use prompt for the full prepared context.
- **Context admission selection mode**: behavior actually used by the context
  manager for gathered candidates. `include_all` records budgets without
  trimming; `budgeted` means candidates can be dropped under configured limits.
- **System prompt id**: durable profile identifier for the source of resolved
  system instructions.
- **System instructions**: resolved prompt text passed from core to runtime for
  one prepared assistant turn.

## Request Chain

- **ChatStreamRequest**: browser-facing `sidechat.v1` stream request.
- **StreamChatInput**: product-core input assembled by the service adapter.
- **AgentRuntimeRequest**: prepared turn request from product core into agent
  runtime.
- **RuntimeProviderRequest**: provider-ready request after runtime preparation.
- **AI SDK provider request**: private provider/options payload inside runtime.

## Capability Terms

- **Host capability manifest**: host-app declaration of possible profiles,
  tools, commands, retrieval sources, research agents, policies, and renderers.
- **Assistant profile**: versioned assistant configuration selected for one turn.
- **ToolCapability**: manifest declaration for a backend capability; not
  executable until policy selects it and runtime has a matching RuntimeTool.
- **RuntimeTool**: app-owned executable model-callable backend tool registered
  with agent runtime.
- **HostCommandCapability**: manifest declaration for a browser/host-app UI
  command, separate from RuntimeTool.
- **RetrievalSourceCapability**: manifest declaration for a source RAG may search
  when policy allows it.
- **RagRetrieverPort**: core port for authorized pre-model retrieval from
  policy-allowed sources.
- **RagContextCandidate**: retrieved context candidate with provenance, trust,
  redaction class, and token estimate.
- **ResearchAgentPort**: core port for policy-scoped pre-answer research that
  produces prepared context candidates and artifacts.
- **ResearchSourceCandidate**: research context candidate admitted only when its
  source is policy-allowed.
- **MemoryPolicy**: manifest/profile policy for whether memory may be read or
  written for one turn.
- **MemoryPort**: core port for memory recall and post-turn memory write
  candidates.
- **MemoryRecord**: recalled durable memory allowed into prepared context.
- **MemoryWriteCandidate**: post-turn candidate proposed for durable memory
  storage under MemoryPolicy.
- **TurnGuard**: pre-context safety check that may allow, warn, or block one
  turn.
- **AgentExecutor**: runtime execution engine selected for one prepared turn and
  responsible for emitting RuntimeEvents.
- **ApprovalPolicy**: policy requiring user or host approval before a declared
  tool or host command is used.

## Tool And Host Terms

- **Tool call**: model/provider request to execute a runtime tool.
- **Tool result**: successful result from a runtime tool.
- **Tool error**: public failed tool activity shape, not a raw thrown value.
- **Host command**: command sent from Side Chat to a host app capability.
- **Host command result**: result returned by a host app after a host command.

## Event Terms

- **AI SDK stream part**: provider/tool-loop event emitted by AI SDK; private to
  `agent-runtime`.
- **RuntimeEvent**: normalized internal event emitted by agent runtime.
- **RuntimeActivityDetails**: provider-neutral activity details mapped by core to
  browser-safe activity details.
- **SidechatStreamEvent**: browser-facing `sidechat.v1` stream event.
- **Activity event**: visible progress, tool, reasoning, or host-command row.
- **Widget message**: client-side message state rendered by the widget.
- **Widget activity item**: client-side activity timeline row derived from
  protocol activity events.
- **Terminal event**: final browser-facing event that closes product turn state.
- **Pre-start failure**: failure before `sidechat.started`; request setup
  rejects.
- **Post-start failure**: failure after `sidechat.started`; stream emits terminal
  `sidechat.error`.

## Boundary Terms

- **HTTP adapter boundary**: HTTP/Hono request becomes StreamChatInput.
- **Product core boundary**: StreamChatInput and ports become protocol event
  stream.
- **Runtime boundary**: AgentRuntimeRequest becomes RuntimeEvent stream.
- **Protocol boundary**: core event mapper emits browser-safe `sidechat.v1`.
- **Widget boundary**: protocol events become UI message/activity state.
- **Host bridge boundary**: widget/product host seam to host commands/context.
- **Database boundary**: product ports become persistence records.
- **Copied UI primitive**: external visual component under widget `shared/ai`.

## Names To Avoid In Larger Scopes

Avoid these unless the type or tiny local scope makes the meaning obvious:

```txt
data item entry payload result context event part message request response state
handle process map normalize build create
```

Prefer completed source-to-target names:

```txt
mapAiSdkPartToRuntimeEvents
mapRuntimeEventToProtocolEvent
createRuntimeProviderRequest
applyProtocolActivityToWidgetTimeline
recordStartedStreamTurn
```
