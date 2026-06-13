# Side Chat Domain Vocabulary

Read this when: a term in code, docs, tests, comments, events, or review notes
is unclear.
Source of truth for: canonical terms, aliases, forbidden aliases, and ownership.
Not source of truth for: architecture decisions or implementation plans.

## Rules

| Rule                   | Meaning                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| One canonical name     | Use the term in this file when naming code, docs, and tests.                 |
| Owner is explicit      | The owner owns the shape and meaning of the term.                            |
| Definitions stay short | If a definition needs an essay, split the term.                              |
| Aliases are deliberate | Allowed aliases are local conveniences; forbidden aliases should be removed. |
| Update with code       | Rename or add vocabulary in the same patch as code/docs that introduce it.   |

## Core Product Terms

| Term                           | Meaning                                                                                                                 | Owner                     | Do not confuse with  | Allowed aliases          | Forbidden aliases            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------- | ------------------------ | ---------------------------- |
| Side Chat                      | The adoptable enterprise assistant foundation owned by this repo.                                                       | product docs              | a generic chat app   | none                     | chat app, AI thing           |
| adoptable assistant foundation | Ownable repository shape that an enterprise team can deploy and extend with its app-specific assistant capabilities.    | architecture docs         | public SDK framework | assistant foundation     | demo app, plugin framework   |
| host app                       | The consuming web app that embeds Side Chat and owns business UI, auth, domain entities, and host-specific permissions. | product docs, host bridge | Side Chat service    | embedding app when local | demo app                     |
| embedding surface              | Host-app page, dashboard, portal, or internal tool where Side Chat is embedded.                                         | product docs, widget      | Side Chat Widget     | none                     | host app                     |
| workspace                      | Authorized product scope for a request.                                                                                 | `partner-ai-core`         | browser session      | none                     | tenant when not in code      |
| project                        | Optional product scope associated with a conversation or request.                                                       | `partner-ai-core`         | workspace            | none                     | generic context              |
| conversation                   | Durable chat thread containing user messages and assistant turns.                                                       | `partner-ai-core`, `db`   | assistant turn       | thread when local        | chat session                 |
| user message                   | User-submitted message persisted and displayed in a conversation.                                                       | `partner-ai-core`, widget | protocol request     | none                     | input, prompt in broad scope |
| assistant turn                 | One assistant response lifecycle attached to a user message.                                                            | `partner-ai-core`, `db`   | model call           | none                     | run, response in broad scope |
| stream chat turn               | Product workflow that prepares and streams one assistant turn.                                                          | `partner-ai-core`         | runtime execution    | none                     | stream in broad scope        |
| turn plan                      | Policy decision for allowed profile, model, and tools for one turn.                                                     | `partner-ai-core`         | runtime request      | none                     | config, options              |
| prepared context               | Context snapshot/messages prepared before runtime execution.                                                            | `partner-ai-core`         | host context         | none                     | prompt in broad scope        |

## Request Chain

| Term                    | Meaning                                                  | Owner             | Do not confuse with     | Allowed aliases | Forbidden aliases               |
| ----------------------- | -------------------------------------------------------- | ----------------- | ----------------------- | --------------- | ------------------------------- |
| ChatStreamRequest       | Browser-facing `sidechat.v1` stream request.             | `chat-protocol`   | StreamChatInput         | none            | request in broad scope          |
| StreamChatInput         | Product-core input assembled by the service adapter.     | `partner-ai-core` | ChatStreamRequest       | none            | input in broad scope            |
| AgentRuntimeRequest     | Request from product core into agent runtime.            | `agent-runtime`   | RuntimeProviderRequest  | none            | runtime input                   |
| RuntimeProviderRequest  | Provider-ready request after runtime preparation.        | `agent-runtime`   | AI SDK provider request | none            | provider request in broad scope |
| AI SDK provider request | Private DTO/options passed to AI SDK/provider internals. | `agent-runtime`   | RuntimeProviderRequest  | none            | runtime request                 |

## Event Chain

| Term                 | Meaning                                                                                  | Owner                     | Do not confuse with    | Allowed aliases | Forbidden aliases           |
| -------------------- | ---------------------------------------------------------------------------------------- | ------------------------- | ---------------------- | --------------- | --------------------------- |
| AI SDK stream part   | Provider/tool-loop event emitted by AI SDK.                                              | `agent-runtime`           | RuntimeEvent           | none            | part in broad scope         |
| RuntimeEvent         | Normalized internal event emitted by agent runtime.                                      | `agent-runtime`           | SidechatStreamEvent    | none            | event in broad scope        |
| activity event       | Runtime/protocol event kind for visible progress, tool, reasoning, or host-command rows. | runtime, protocol, widget | terminal event         | none            | activity in broad scope     |
| SidechatStreamEvent  | Browser-facing `sidechat.v1` stream event.                                               | `chat-protocol`           | RuntimeEvent           | protocol event  | stream event in broad scope |
| widget message       | Client-side message state rendered by the widget.                                        | widget                    | protocol event         | none            | message in broad scope      |
| widget activity item | Client-side activity timeline row derived from protocol activity events.                 | widget                    | runtime activity event | none            | item                        |

## Capability Terms

| Term                      | Meaning                                                                                                              | Owner                      | Do not confuse with         | Allowed aliases     | Forbidden aliases      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------- | ------------------- | ---------------------- |
| host capability manifest  | Host-app declaration of possible profiles, tools, commands, retrieval sources, policies, workflows, and renderers.   | `partner-ai-core`, service | executable registry         | manifest when local | plugin list            |
| assistant profile         | Versioned assistant configuration selected for one turn before runtime execution.                                    | `partner-ai-core`          | model id                    | profile when local  | persona in broad scope |
| ToolCapability            | Manifest declaration for a backend capability that may become a runtime tool if policy and registry allow it.        | `partner-ai-core`          | RuntimeTool                 | tool declaration    | tool in broad scope    |
| RetrievalSourceCapability | Manifest declaration for a source that RAG may search when policy allows it.                                         | `partner-ai-core`          | RuntimeTool                 | retrieval source    | search tool            |
| MemoryPolicy              | Manifest/profile policy for whether memory may be read or written for one turn.                                      | `partner-ai-core`          | RAG source                  | none                | memory store           |
| TurnPolicyDecision        | Per-turn policy result that selects profile/model/tools/commands/RAG/memory/workflow exposure.                       | `partner-ai-core`          | host capability manifest    | policy decision     | config, options        |
| TurnGuard                 | Pre-context safety check that may allow, warn, or block one turn before conversation persistence, context, or tools. | `partner-ai-core`, service | product policy, RuntimeTool | guard when local    | safety plugin          |
| executable registry       | Runtime or service-side collection of concrete implementations that can run if selected.                             | service, `agent-runtime`   | host capability manifest    | registry when local | plugin list            |

## Tool And Activity Terms

| Term                | Meaning                                                                 | Owner           | Do not confuse with     | Allowed aliases | Forbidden aliases     |
| ------------------- | ----------------------------------------------------------------------- | --------------- | ----------------------- | --------------- | --------------------- |
| RuntimeTool         | App-owned executable model-callable tool registered with agent runtime. | `agent-runtime` | ToolCapability          | none            | tool in broad scope   |
| tool call           | Model/provider request to execute a runtime tool.                       | `agent-runtime` | host command            | none            | call in broad scope   |
| tool result         | Successful result from a runtime tool.                                  | `agent-runtime` | host command result     | none            | result in broad scope |
| tool error          | Public failed tool activity shape, not a raw thrown value.              | `agent-runtime` | provider/tool exception | none            | exception             |
| host command        | Command sent from Side Chat to a host app capability.                   | `host-bridge`   | runtime tool call       | none            | tool call             |
| host command result | Result returned by a host app after a host command.                     | `host-bridge`   | tool result             | none            | result in broad scope |

## Package And Boundary Terms

| Term                  | Meaning                                                                     | Owner                  | Do not confuse with     | Allowed aliases      | Forbidden aliases             |
| --------------------- | --------------------------------------------------------------------------- | ---------------------- | ----------------------- | -------------------- | ----------------------------- |
| HTTP adapter boundary | Service route seam that parses HTTP and delegates product workflow.         | `partner-ai-service`   | product core            | route boundary       | route logic                   |
| product core boundary | Seam where `partner-ai-core` owns product workflow and ports.               | `partner-ai-core`      | runtime boundary        | core boundary        | core in broad scope           |
| runtime boundary      | Seam where `agent-runtime` hides provider and AI SDK details.               | `agent-runtime`        | protocol boundary       | none                 | adapter boundary when unclear |
| protocol boundary     | Seam exposing browser-facing `sidechat.v1` types/events.                    | `chat-protocol`        | runtime boundary        | none                 | contract when vague           |
| widget boundary       | Seam where protocol events become UI state.                                 | widget                 | protocol boundary       | none                 | client boundary               |
| host bridge boundary  | Seam between widget/product and host app capabilities.                      | `host-bridge`          | runtime tool boundary   | none                 | host in broad scope           |
| database boundary     | Seam between product ports and persistence records.                         | `db`, service adapters | product core            | persistence boundary | persistence in broad scope    |
| copied UI primitive   | External copied visual component not governed by project readability style. | widget `shared/ai`     | project-owned component | copied AI component  | shared component              |

## Terminal Lifecycle Terms

| Term                 | Meaning                                                                        | Owner           | Do not confuse with     | Allowed aliases | Forbidden aliases          |
| -------------------- | ------------------------------------------------------------------------------ | --------------- | ----------------------- | --------------- | -------------------------- |
| `sidechat.started`   | Browser-facing event meaning product stream setup succeeded.                   | `chat-protocol` | HTTP response open      | none            | started in broad scope     |
| `sidechat.completed` | Browser-facing terminal success event.                                         | `chat-protocol` | transport close         | none            | done                       |
| `sidechat.error`     | Browser-facing terminal error after stream start.                              | `chat-protocol` | HTTP pre-start error    | none            | failure in broad scope     |
| pre-start failure    | Failure before the browser receives `sidechat.started`; request setup rejects. | service, core   | terminal protocol error | none            | setup error when unclear   |
| post-start failure   | Failure after `sidechat.started`; stream emits terminal `sidechat.error`.      | core, protocol  | HTTP error              | none            | runtime error when unclear |
| terminal event       | Final browser-facing event closing product turn state.                         | `chat-protocol` | transport close         | none            | final event in broad scope |

## UI And Widget Terms

| Term                         | Meaning                                                                | Owner  | Do not confuse with    | Allowed aliases | Forbidden aliases       |
| ---------------------------- | ---------------------------------------------------------------------- | ------ | ---------------------- | --------------- | ----------------------- |
| optimistic user message      | Pending user message shown before stream completion.                   | widget | persisted user message | none            | local message           |
| optimistic assistant message | Assistant placeholder while a stream is running.                       | widget | assistant turn record  | none            | pending response        |
| widget stream event          | Protocol event as consumed by widget state.                            | widget | RuntimeEvent           | none            | event in broad scope    |
| activity timeline            | UI list of progress, tool, reasoning, and host-command activity items. | widget | conversation messages  | none            | timeline in broad scope |

## Persistence Terms

| Term               | Meaning                                                               | Owner             | Do not confuse with    | Allowed aliases | Forbidden aliases   |
| ------------------ | --------------------------------------------------------------------- | ----------------- | ---------------------- | --------------- | ------------------- |
| repository port    | Product-core interface for persistence work.                          | `partner-ai-core` | Drizzle repository     | none            | database helper     |
| repository adapter | Concrete persistence implementation behind a port.                    | `db`, service     | repository port        | none            | port when concrete  |
| memory repository  | Deterministic in-memory repository for tests and local harness paths. | `db`, tests       | production persistence | fake repository | production fallback |

## Forbidden Generic Names In Larger Scopes

Avoid these in boundary and spine functions unless the scope is tiny and the type
makes meaning obvious:

```txt
data
item
entry
payload
result
context
event
part
message
request
response
state
handle
process
map
normalize
build
create
```

Prefer completed source-to-target names:

```txt
mapAiSdkPartToRuntimeEvents
mapRuntimeEventToProtocolEvent
createRuntimeProviderRequest
createProtocolStartedEvent
applyProtocolActivityToWidgetTimeline
recordStartedStreamTurn
```

## Terms Pending Clarification

| Term              | Question                                              | Temporary owner   |
| ----------------- | ----------------------------------------------------- | ----------------- |
| workflow run      | Exact durable shape for future multi-agent workflows. | product docs      |
| context manifest  | Final persisted hash and manifest semantics.          | `partner-ai-core` |
| memory extraction | Whether memory is product-owned, host-owned, or both. | product docs      |
