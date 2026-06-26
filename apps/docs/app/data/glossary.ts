/**
 * The single source of truth for Side Chat glossary terms in the docs site.
 *
 * Mirrors the canonical `docs/domain/vocabulary.md`. Both the `<Term>` hover
 * card and the `<Glossary>` page render from this list, and the auto-link rehype
 * plugin (source.config.ts) wraps the first prose mention of any `match` phrase.
 *
 * This module is pure data (no React) so it can be imported by the build-time
 * config and by browser components alike.
 */

export type GlossaryCategoryId = "basics" | "ai" | "turn" | "events" | "identity" | "packages";

export interface GlossaryCategory {
  id: GlossaryCategoryId;
  title: string;
  blurb: string;
}

export interface GlossaryTerm {
  /** Slug used as the anchor on the Vocabulary page and the `<Term id>` key. */
  id: string;
  /** Canonical display name. */
  term: string;
  /** One-line, plain-English meaning. */
  definition: string;
  category: GlossaryCategoryId;
  /** Where the term is defined in code (path, optionally with the symbol). */
  code?: string;
  /**
   * Phrases the auto-link plugin may wrap on first prose mention. Omit for terms
   * that are too generic to match safely or that only appear inside code spans.
   */
  match?: string[];
}

export const glossaryCategories: readonly GlossaryCategory[] = [
  { id: "basics", title: "AI & LLM basics", blurb: "General language-model vocabulary — the words you need before reading the code." },
  { id: "ai", title: "AI concepts", blurb: "The product shape, the model knobs, and the context the assistant runs on." },
  { id: "turn", title: "Turn lifecycle", blurb: "One user message produces one assistant turn, run on a server-owned fiber." },
  { id: "events", title: "Protocol & runtime events", blurb: "Three event vocabularies, never conflated, each lower than the last." },
  { id: "identity", title: "Identity & authority", blurb: "Authority is proven and fail-closed before any persistence or model work." },
  { id: "packages", title: "Packages & boundaries", blurb: "Four layers, dependencies inward: Browser → Service → Core → Runtime." },
];

export const glossary: readonly GlossaryTerm[] = [
  // ── AI & LLM basics ────────────────────────────────────────────────────────
  {
    id: "llm",
    term: "LLM",
    definition: "A large language model: a function that takes text in and predicts text out, with no memory between calls.",
    category: "basics",
    match: ["LLM"],
  },
  {
    id: "token",
    term: "Token",
    definition: "The word-fragments a model actually reads and writes. Usage is counted in input and output tokens.",
    category: "basics",
    match: ["token"],
  },
  {
    id: "context",
    term: "Context",
    definition: "Everything assembled into one model call: system instructions, past messages, the current question, and tool descriptions.",
    category: "basics",
  },
  {
    id: "context-window",
    term: "Context window",
    definition: "The maximum number of tokens a model can take in one call; everything you send competes for that fixed budget.",
    category: "basics",
    match: ["context window"],
  },
  {
    id: "prompt",
    term: "Prompt",
    definition: "Not one string but a list of role-tagged messages. The server owns most of it; the browser only sends content.",
    category: "basics",
  },
  {
    id: "message",
    term: "Message",
    definition: "One item in the model's input list, each tagged with a role (system, user, or assistant).",
    category: "basics",
  },
  {
    id: "role",
    term: "Role (system / user / assistant)",
    definition: "Tags telling the model who said what. The browser never sets roles — the server assigns user and writes system itself.",
    category: "basics",
  },
  {
    id: "delta",
    term: "Delta",
    definition: "One fragment of new text streamed as the model produces it (a sidechat.delta event).",
    category: "basics",
    match: ["delta"],
  },
  {
    id: "streaming-sse",
    term: "Streaming / SSE",
    definition: "Server-Sent Events: a one-way stream of text frames over one HTTP response, one event per frame, used to stream the answer live.",
    category: "basics",
    match: ["SSE", "Server-Sent Events"],
  },
  {
    id: "tool",
    term: "Tool (function calling)",
    definition: "A capability the model can request. The model only asks; your code runs the tool and hands the result back.",
    category: "basics",
  },
  {
    id: "tool-loop",
    term: "Tool loop",
    definition: "The back-and-forth where the model emits a tool call, the runtime runs it and feeds the result back, until the model writes the final text.",
    category: "basics",
    match: ["tool loop"],
  },
  {
    id: "agentic",
    term: "Agentic",
    definition: "When the system can take actions (call tools), observe results, and decide what to do next, looping until the task is done.",
    category: "basics",
    match: ["agentic"],
  },
  {
    id: "provider",
    term: "Provider",
    definition: "The company or API you call (for example openai). One provider offers many models.",
    category: "basics",
    match: ["provider"],
  },
  {
    id: "model",
    term: "Model",
    definition: "One specific model a provider offers (for example gpt-5.4-mini). The server, not the browser, chooses it.",
    category: "basics",
  },
  {
    id: "reasoning",
    term: "Reasoning",
    definition: "A model thinking privately before answering. Hidden by default and set as a provider-level effort, not by the browser.",
    category: "basics",
  },
  {
    id: "system-prompt",
    term: "System prompt",
    definition: "The server's standing instructions, given to the model under the system role. Written by the server, never the browser.",
    category: "basics",
    match: ["system prompt"],
  },
  {
    id: "turn",
    term: "Turn",
    definition: "One complete cycle: a user message in, leading to one finished assistant reply out, including any tool loops between.",
    category: "basics",
  },
  {
    id: "hallucination",
    term: "Hallucination",
    definition: "Fluent but false or unsupported model output. Tools and grounding reduce it by giving the model real data to work from.",
    category: "basics",
  },
  // ── AI concepts ──────────────────────────────────────────────────────────
  {
    id: "side-chat",
    term: "Side Chat",
    definition: "The adoptable enterprise assistant foundation owned by this repo.",
    category: "ai",
    code: "packages/chat-protocol/src/sidechat-v1/version.ts (sidechat.v1)",
    match: ["Side Chat"],
  },
  {
    id: "host-app",
    term: "Host app",
    definition: "The consuming web app that embeds Side Chat and owns its own UI, auth, and data.",
    category: "ai",
    code: "packages/ai-runtime-contract/src/runtime-ids.ts (HostAppId)",
    match: ["host app"],
  },
  {
    id: "embedding-surface",
    term: "Embedding surface",
    definition: "The host page, portal, or internal tool where the widget is mounted.",
    category: "ai",
    code: "Concept; the code handle is HostAppId",
  },
  {
    id: "conversation",
    term: "Conversation",
    definition: "A durable chat thread of user messages and assistant turns.",
    category: "ai",
    code: "packages/ai-runtime-contract/src/runtime-ids.ts (ConversationId)",
    match: ["conversation"],
  },
  {
    id: "conversation-title",
    term: "Conversation title",
    definition: "Display label generated once after the first successful exchange, when config enables it.",
    category: "ai",
    code: "packages/partner-ai-core/src/ports/title/conversation-title-generation.ts",
  },
  {
    id: "auxiliary-model-job",
    term: "Auxiliary model job",
    definition: "A service-configured model task outside the main turn, such as title generation.",
    category: "ai",
    code: "apps/partner-ai-service/src/config/catalog/capabilities/auxiliary-jobs.ts (AUXILIARY_JOBS)",
  },
  {
    id: "model-catalog",
    term: "Model catalog",
    definition: "Backend-published list of provider/model ids, display names, and selectable efforts.",
    category: "ai",
    code: "apps/partner-ai-service/.../routes/models/models.ts (GET /models)",
    match: ["model catalog"],
  },
  {
    id: "model-preference",
    term: "Model preference",
    definition: "Optional per-turn model choice on the request; valid only after the service checks it.",
    category: "ai",
    code: "packages/chat-protocol/src/sidechat-v1/request/request.ts (ChatModelPreference)",
  },
  {
    id: "reasoning-effort",
    term: "Reasoning effort",
    definition: "Per-turn, provider-neutral reasoning setting; six values mirror across layers.",
    category: "ai",
    code: "packages/ai-runtime-contract/src/index.ts (RUNTIME_REASONING_EFFORTS)",
    match: ["reasoning effort"],
  },
  {
    id: "prepared-context",
    term: "Prepared context",
    definition: "The context snapshot and messages assembled before runtime execution.",
    category: "ai",
    code: "packages/partner-ai-core/src/domain/capabilities (PreparedTurnContext)",
    match: ["prepared context"],
  },
  {
    id: "context-candidate",
    term: "Context candidate",
    definition: "One scored, classified item the admission selector may keep or drop.",
    category: "ai",
    code: "packages/partner-ai-core/.../contracts/context.ts (ContextCandidate)",
    match: ["context candidate"],
  },
  {
    id: "context-admission-selection-mode",
    term: "Context admission selection mode",
    definition: "What the selector did: include_all records budgets without trimming; budgeted may drop candidates.",
    category: "ai",
    code: "packages/partner-ai-core/.../contracts/context.ts",
  },
  {
    id: "system-prompt-id",
    term: "System prompt id",
    definition: "Durable profile id naming the source of resolved instructions.",
    category: "ai",
    code: "packages/partner-ai-core/.../contracts/ids/capability-ids.ts (SystemPromptId)",
  },
  {
    id: "system-instructions",
    term: "System instructions",
    definition: "Resolved prompt text that core renders into runtime messages for one turn.",
    category: "ai",
    code: "packages/partner-ai-core/.../contracts/capabilities.ts (TurnProfile.systemInstructions)",
  },

  // ── Turn lifecycle ───────────────────────────────────────────────────────
  {
    id: "user-message",
    term: "User message",
    definition: "A user-submitted message, persisted and displayed. Avoid the broad terms input and prompt.",
    category: "turn",
    code: "packages/chat-protocol/src/sidechat-v1/request/request.ts (ChatRequestMessage)",
    match: ["user message"],
  },
  {
    id: "assistant-turn",
    term: "Assistant turn",
    definition: "One assistant-response lifecycle attached to a user message. Not the same as one model call.",
    category: "turn",
    code: "packages/ai-runtime-contract/src/runtime-ids.ts (AssistantTurnId)",
    match: ["assistant turn"],
  },
  {
    id: "stream-chat-turn",
    term: "Stream chat turn",
    definition: "The product workflow that prepares and streams one assistant turn.",
    category: "turn",
    code: "packages/partner-ai-core/src/application/stream-chat/",
    match: ["stream chat turn"],
  },
  {
    id: "turn-policy-decision",
    term: "TurnPolicyDecision",
    definition: "The per-turn decision: profile, model, allowed tools and commands, approvals, executor, and instructions.",
    category: "turn",
    code: "packages/partner-ai-core/.../contracts/capabilities.ts (TurnPolicyDecision)",
  },
  {
    id: "resolved-turn-plan",
    term: "ResolvedTurnPlan",
    definition: "The workflow value wrapping the manifest, its hash, the TurnPolicyDecision, and the resolved profile.",
    category: "turn",
    code: "packages/partner-ai-core/src/application/stream-chat/turn/turn-policy-plan.ts",
  },
  {
    id: "server-owned-generation",
    term: "Server-owned generation",
    definition: "The turn runs on a service fiber forked off the request, so it outlives any one connection.",
    category: "turn",
    code: "apps/partner-ai-service/src/inbound/turn-runner/turn-runner.ts",
    match: ["server-owned generation"],
  },
  {
    id: "turn-runner",
    term: "Turn runner",
    definition: "Per-instance component that forks generation and tracks live turns in a FiberMap keyed by assistantTurnId.",
    category: "turn",
    code: "apps/partner-ai-service/src/inbound/turn-runner/turn-runner.ts (TurnRunner)",
    match: ["turn runner"],
  },
  {
    id: "durable-turn-event-log",
    term: "Durable turn-event log",
    definition: "Append-only, per-turn ordered log; the source of truth for a turn's events. The browser only subscribes.",
    category: "turn",
    code: "packages/db/src/drizzle/schema.ts (turn_events)",
    match: ["durable turn-event log", "turn-event log"],
  },
  {
    id: "replay-offset",
    term: "Replay offset (after)",
    definition: "Stream cursor. GET /chat/turns/:assistantTurnId/stream?after=<seq> emits events after that sequence; started is sequence 0.",
    category: "turn",
    code: "apps/partner-ai-service/.../routes/chat/turns/chat-turns.ts",
  },
  {
    id: "owner-lease",
    term: "Owner lease (fencing)",
    definition: "Compare-and-set claim binding one running turn to one instance. A renew matching no row means the owner was fenced.",
    category: "turn",
    code: "packages/partner-ai-core/.../ports/lifecycle/assistant-turn.ts (acquireTurnLease)",
    match: ["owner lease"],
  },
  {
    id: "reaper",
    term: "Reaper",
    definition: "Background sweep that terminalizes lease-expired turns, fencing a dead or stalled owner.",
    category: "turn",
    code: "apps/partner-ai-service/src/inbound/turn-runner/maintenance/turn-reaper.ts (TurnReaper)",
    match: ["reaper"],
  },
  {
    id: "pruner",
    term: "Pruner",
    definition: "Background sweep that deletes event rows of old terminal turns past retention; the turn still resolves.",
    category: "turn",
    code: "apps/partner-ai-service/src/inbound/turn-runner/maintenance/turn-pruner.ts",
    match: ["pruner"],
  },
  {
    id: "pre-start-failure",
    term: "Pre-start failure",
    definition: "A failure before sidechat.started; setup is rejected as a JSON response, not a stream event.",
    category: "turn",
    code: "apps/partner-ai-service/.../routes/chat/runs/chat-runs.ts (mapPreStartError)",
    match: ["pre-start failure"],
  },
  {
    id: "post-start-failure",
    term: "Post-start failure",
    definition: "A failure after sidechat.started; the stream emits a terminal sidechat.error or sidechat.blocked.",
    category: "turn",
    code: "packages/chat-protocol/src/sidechat-v1/events/event-union.ts (ErrorEvent)",
    match: ["post-start failure"],
  },

  // ── Protocol & runtime events ──────────────────────────────────────────────
  {
    id: "ai-sdk-stream-part",
    term: "AI SDK stream part",
    definition: "A provider or tool-loop event from the AI SDK; private to agent-runtime.",
    category: "events",
    code: "packages/agent-runtime/.../ai-sdk/streaming/stream-part-mapper.ts (mapAiSdkStreamPart)",
    match: ["AI SDK stream part"],
  },
  {
    id: "runtime-event",
    term: "RuntimeEvent",
    definition: "The normalized internal event from agent runtime: started, output_delta, activity, completed, error, blocked.",
    category: "events",
    code: "packages/ai-runtime-contract/src/index.ts (RUNTIME_EVENT_TYPES)",
    match: ["RuntimeEvent"],
  },
  {
    id: "runtime-activity-details",
    term: "RuntimeActivityDetails",
    definition: "Provider-neutral activity detail that core maps to browser-safe activity detail.",
    category: "events",
    code: "packages/ai-runtime-contract/src/runtime-activity.ts",
  },
  {
    id: "map-runtime-event",
    term: "mapRuntimeEvent",
    definition: "The core function that maps one RuntimeEvent to its sidechat.v1 event(s).",
    category: "events",
    code: "packages/partner-ai-core/.../protocol/runtime-event-mapper.ts",
  },
  {
    id: "sidechat-stream-event",
    term: "SidechatStreamEvent",
    definition: "Any sidechat.v1 event a browser client can receive for one stream.",
    category: "events",
    code: "packages/chat-protocol/src/sidechat-v1/events/event-union.ts",
    match: ["SidechatStreamEvent"],
  },
  {
    id: "activity-event",
    term: "Activity event (sidechat.activity)",
    definition: "A progress, reasoning, tool, or host-command row inside one turn's stream.",
    category: "events",
    code: "packages/chat-protocol/.../events/event-union.ts (ActivityEvent)",
    match: ["activity event"],
  },
  {
    id: "turn-activity-event",
    term: "Turn activity event (sidechat.turn-activity)",
    definition: "A cross-conversation lifecycle signal on GET /chat/activity that powers the generating dot on other chats.",
    category: "events",
    code: "packages/chat-protocol/.../codec/activity-sse-codec.ts (TURN_ACTIVITY_EVENT_TYPE)",
    match: ["turn activity event", "turn-activity event"],
  },
  {
    id: "terminal-event",
    term: "Terminal event",
    definition: "The final event closing turn state: completed, error, or blocked.",
    category: "events",
    code: "packages/chat-protocol/.../events/event-union.ts (isTerminalEvent)",
    match: ["terminal event"],
  },
  {
    id: "sidechat-blocked",
    term: "sidechat.blocked",
    definition: "A terminal safety-stop: the turn was blocked before a usable answer, kept distinct from completed.",
    category: "events",
    code: "packages/chat-protocol/.../events/event-union.ts (BlockedEvent)",
  },
  {
    id: "sidechat-history",
    term: "sidechat.history / HistoryMessage",
    definition: "Replay payload of past messages the widget falls back to after replay_expired.",
    category: "events",
    code: "packages/chat-protocol/.../events/event-union.ts (HistoryEvent, HistoryMessage)",
  },
  {
    id: "tool-call-result-error",
    term: "Tool call / result / error",
    definition: "The model's request to run a tool, its successful result, and its public failed shape (errorCode).",
    category: "events",
    code: "packages/ai-runtime-contract/src/runtime-activity.ts",
  },
  {
    id: "host-command-result",
    term: "Host command / result",
    definition: "A command Side Chat sends to a host capability, and the host's returned result.",
    category: "events",
    code: "packages/host-bridge/src/commands/command-result.ts (HostCommandResult)",
  },
  {
    id: "widget-message-activity",
    term: "Widget message / activity item",
    definition: "Client-side message and timeline state the widget renders from protocol events.",
    category: "events",
    code: "packages/side-chat-widget/src/entities/chat/model/",
  },
  {
    id: "protocol-error-code",
    term: "ProtocolErrorCode",
    definition: "A turn-outcome code carried on a sidechat.v1 error event (for example provider_failed).",
    category: "events",
    code: "packages/chat-protocol/src/sidechat-v1/errors.ts (PROTOCOL_ERROR_CODES)",
  },
  {
    id: "transport-error-code",
    term: "TransportErrorCode",
    definition: "A code for why a stream could not even open, returned as JSON before any frame.",
    category: "events",
    code: "packages/chat-protocol/src/sidechat-v1/errors.ts (TRANSPORT_ERROR_CODES)",
  },
  {
    id: "replay-expired",
    term: "replay_expired",
    definition: "The one TransportErrorCode (HTTP 404): a pruned log can no longer replay from after.",
    category: "events",
    code: "packages/chat-protocol/src/sidechat-v1/errors.ts (TRANSPORT_ERROR_CODES.REPLAY_EXPIRED)",
  },

  // ── Identity & authority ───────────────────────────────────────────────────
  {
    id: "auth-context",
    term: "AuthContext",
    definition: "The proven authority object (tenant, workspace, subject, roles, scopes) that gates all protected work.",
    category: "identity",
    code: "packages/partner-ai-core/src/domain/authority.ts (AuthContext)",
    match: ["AuthContext"],
  },
  {
    id: "tenant",
    term: "Tenant / TenantId",
    definition: "The top authorization layer above workspace. A real, load-bearing branded id; authority compares tenant first.",
    category: "identity",
    code: "packages/partner-ai-core/src/domain/authority.ts (TenantId)",
    match: ["tenant"],
  },
  {
    id: "workspace",
    term: "Workspace / WorkspaceRef",
    definition: "A tenant's authorized product scope for a request: { tenantId, workspaceId }.",
    category: "identity",
    code: "packages/partner-ai-core/src/domain/authority.ts (WorkspaceRef)",
    match: ["workspace"],
  },
  {
    id: "subject",
    term: "Subject / SubjectId",
    definition: "The acting principal (subjectId plus userId). GET /chat/activity is scoped per workspace and subject.",
    category: "identity",
    code: "packages/partner-ai-core/src/domain/authority.ts (SubjectRef)",
  },
  {
    id: "user",
    term: "User / UserId",
    definition: "The human identity behind a subject.",
    category: "identity",
    code: "packages/partner-ai-core/src/domain/authority.ts (UserId)",
  },
  {
    id: "authority-denial",
    term: "Authority denial",
    definition: "A fail-closed rejection with a code such as missing_auth or cross_tenant_workspace.",
    category: "identity",
    code: "packages/partner-ai-core/src/domain/authority.ts (AuthorityDenial)",
    match: ["authority denial"],
  },
  {
    id: "host-context",
    term: "HostContext",
    definition: "Browser page metadata (origin, url, title). Reference data only; never proof of identity or access.",
    category: "identity",
    code: "packages/chat-protocol/src/sidechat-v1/request/request.ts (HostContext)",
    match: ["HostContext"],
  },
  {
    id: "request-id",
    term: "requestId",
    definition: "Idempotency and resolver key for one submission; a repeat returns the existing turn.",
    category: "identity",
    code: "packages/ai-runtime-contract/src/runtime-ids.ts (RequestId)",
  },
  {
    id: "assistant-turn-id",
    term: "assistantTurnId",
    definition: "The canonical key for streaming, status, and cancel.",
    category: "identity",
    code: "packages/ai-runtime-contract/src/runtime-ids.ts (AssistantTurnId)",
  },
  {
    id: "branded-id",
    term: "Branded id pattern (Brand<>)",
    definition: "Nominal ids made via brandString/brandNumber, so a raw string will not compile where an id is required.",
    category: "identity",
    code: "packages/shared/src/index.ts (Brand, brandString)",
    match: ["branded id"],
  },

  // ── Packages & boundaries ──────────────────────────────────────────────────
  {
    id: "partner-ai-service",
    term: "apps/partner-ai-service",
    definition: "The deployable Hono composition root. The only app — not a demo or host app.",
    category: "packages",
    code: "apps/partner-ai-service/",
  },
  {
    id: "partner-ai-core",
    term: "packages/partner-ai-core",
    definition: "The Core layer: workflows, domain, ports. Maps RuntimeEvent to sidechat.v1.",
    category: "packages",
    code: "packages/partner-ai-core/",
  },
  {
    id: "agent-runtime",
    term: "packages/agent-runtime",
    definition: "The Runtime layer: the only home for ai and @ai-sdk/*; runs one prepared turn.",
    category: "packages",
    code: "packages/agent-runtime/",
  },
  {
    id: "chat-protocol",
    term: "packages/chat-protocol",
    definition: "The browser-to-service contract: sidechat.v1 requests, events, and error codes.",
    category: "packages",
    code: "packages/chat-protocol/",
  },
  {
    id: "ai-runtime-contract",
    term: "packages/ai-runtime-contract",
    definition: "The core-to-runtime contract: AiRuntimeRequest, RuntimeEvent, branded ids.",
    category: "packages",
    code: "packages/ai-runtime-contract/",
  },
  {
    id: "side-chat-widget",
    term: "packages/side-chat-widget",
    definition: "The browser UI. Effect-free and provider-free; TanStack Query for list/history/catalog, not the live stream.",
    category: "packages",
    code: "packages/side-chat-widget/",
  },
  {
    id: "host-bridge",
    term: "packages/host-bridge",
    definition: "The widget-to-host seam for host commands and context.",
    category: "packages",
    code: "packages/host-bridge/",
  },
  {
    id: "db",
    term: "packages/db",
    definition: "The only home for pg and drizzle-orm; owns turn_events and persistence.",
    category: "packages",
    code: "packages/db/",
  },
  {
    id: "chat-stream-request",
    term: "ChatStreamRequest",
    definition: "The browser-facing sidechat.v1 stream request; may carry a model preference, not provider options.",
    category: "packages",
    code: "packages/chat-protocol/src/sidechat-v1/request/request.ts",
  },
  {
    id: "stream-chat-input",
    term: "StreamChatInput",
    definition: "The product-core input the service adapter assembles from a request.",
    category: "packages",
    code: "packages/partner-ai-core/.../stream-chat/stream-chat-types.ts",
  },
  {
    id: "ai-runtime-request",
    term: "AiRuntimeRequest",
    definition: "The provider-neutral request from core into a runtime implementation.",
    category: "packages",
    code: "packages/ai-runtime-contract/src/index.ts",
  },
  {
    id: "runtime-provider-request",
    term: "RuntimeProviderRequest",
    definition: "The provider-ready request after runtime preparation.",
    category: "packages",
    code: "packages/agent-runtime/src/runtime/turn/runtime-provider-request.ts",
  },
  {
    id: "host-capability-manifest",
    term: "Host capability manifest",
    definition: "The host's declaration of possible profiles, tools, commands, approvals, and renderers.",
    category: "packages",
    code: "packages/partner-ai-core/.../contracts/capabilities.ts (HostCapabilityManifest)",
    match: ["host capability manifest", "capability manifest"],
  },
  {
    id: "turn-profile",
    term: "Turn profile",
    definition: "A versioned per-turn configuration selected for one turn.",
    category: "packages",
    code: "packages/partner-ai-core/.../contracts/capabilities.ts (TurnProfile)",
    match: ["turn profile"],
  },
  {
    id: "tool-capability-vs-runtime-tool",
    term: "ToolCapability vs RuntimeTool",
    definition: "A manifest declaration of a tool (not executable) versus the app-owned executable tool.",
    category: "packages",
    code: "capabilities.ts (ToolCapability); agent-runtime/src/tools/runtime-tool.ts (RuntimeTool)",
  },
  {
    id: "service-tool-registration",
    term: "ServiceToolRegistration",
    definition: "The composition record binding one ToolCapability and its RuntimeTool so they cannot drift.",
    category: "packages",
    code: "apps/partner-ai-service/.../composition/tools/service-tool-registry.ts",
    match: ["ServiceToolRegistration"],
  },
  {
    id: "agent-executor",
    term: "AgentExecutor",
    definition: "The runtime engine that runs one prepared turn and emits RuntimeEvents.",
    category: "packages",
    code: "packages/agent-runtime/src/runtime/executors/agent-executor.ts",
    match: ["AgentExecutor"],
  },
  {
    id: "turn-guard",
    term: "TurnGuard",
    definition: "A pre-context safety check that may allow, warn, or block one turn.",
    category: "packages",
    code: "packages/partner-ai-core/src/ports/guards/turn-guard.ts",
    match: ["TurnGuard"],
  },
  {
    id: "approval-policy",
    term: "ApprovalPolicy",
    definition: "A policy requiring user or host approval before a declared tool or command runs.",
    category: "packages",
    code: "packages/partner-ai-core/.../contracts/capabilities.ts (ApprovalPolicy)",
    match: ["ApprovalPolicy"],
  },
  {
    id: "copied-ui-primitive",
    term: "Copied UI primitive",
    definition: "An external visual component vendored under the widget's shared/ai.",
    category: "packages",
    code: "packages/side-chat-widget/src/shared/ai/",
  },
];

const byId = new Map(glossary.map((entry) => [entry.id, entry]));

export function findGlossaryTerm(id: string): GlossaryTerm | undefined {
  return byId.get(id);
}

export function glossaryByCategory(category: GlossaryCategoryId): readonly GlossaryTerm[] {
  return glossary.filter((entry) => entry.category === category);
}

/**
 * Auto-link targets, longest phrase first so "turn activity event" wins over
 * "activity event". Each entry maps one match phrase to its term id.
 */
export const autoLinkTargets: readonly { phrase: string; id: string }[] = glossary
  .flatMap((entry) => (entry.match ?? []).map((phrase) => ({ phrase, id: entry.id })))
  .sort((a, b) => b.phrase.length - a.phrase.length);
