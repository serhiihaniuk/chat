# Protocol

`sidechat.v1` is the product boundary between service, client, widget, and harness. It defines chat requests, model metadata, history, usage summaries, streaming events, terminal events, and SSE encoding.

Generated artifacts are required:

- `packages/chat-protocol/src/generated/sidechat-v1.schema.generated.json`
- `docs/generated/partner-ai-service.openapi.generated.json`

`scripts/check-generated-artifacts.mjs` fails when these artifacts are missing or malformed. Protocol changes should update runtime codecs, tests, and generated artifacts together.

## Stream Activity Contract

Protocol event type and error strings are centralized in constant objects such
as `SIDECHAT_EVENT_TYPES` and `PROTOCOL_ERROR_CODES`. Product code should import
those constants instead of repeating strings such as `sidechat.activity` or
`bad_request`. Constant object properties use uppercase names.

Assistant activity is represented by `sidechat.activity`. This is the canonical
product event for the widget's Thinking panel and activity timeline. It is not a
provider-native reasoning trace and it is not an AI SDK UI message.

`ActivityEvent` carries:

- `activityId`
- `activityKind`: `progress`, `reasoning`, `tool`, or `host_command`
- `status`: `running`, `completed`, or `failed`
- `title`
- optional `body`
- optional `details`

Canonical shape:

```ts
type ActivityEvent = SidechatEventBase & {
  readonly type: "sidechat.activity";
  readonly activityId: string;
  readonly activityKind: "progress" | "reasoning" | "tool" | "host_command";
  readonly status: "running" | "completed" | "failed";
  readonly title: string;
  readonly body?: string;
  readonly details?: ActivityDetails;
};

type ActivityDetails = {
  readonly sources?: readonly ActivitySource[];
  readonly images?: readonly ActivityImage[];
  readonly tool?: {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly input?: JsonObject;
    readonly result?: JsonObject;
    readonly sources?: readonly ActivitySource[];
    readonly errorCode?: ProtocolErrorCode;
  };
  readonly hostCommand?: {
    readonly commandId: string;
    readonly commandName: string;
    readonly payload: JsonObject;
    readonly result?: JsonObject;
  };
};

type ActivitySource = {
  readonly label: string;
  readonly url?: string;
};

type ActivityImage = {
  readonly alt: string;
  readonly caption?: string;
  readonly mediaType: string;
  readonly data: string;
};
```

`sequence` remains the canonical order across all stream events in an assistant
turn. The widget renders activity rows in protocol sequence order and must not
reconstruct order from grouped state after the fact.

Tool execution is represented as an activity item with
`activityKind: "tool"`. Tool details live inside `details.tool` and carry:

- `toolCallId`
- `toolName`
- `status`
- optional `input`
- optional `result`
- optional `sources`
- optional `errorCode`

`input`, `result`, and `sources` are redacted product DTOs after mapping at the
runtime boundary. The widget may display them in the expandable tool row, but it
must not infer provider SDK shapes from them.

Search results, citations, and image findings that belong to the activity row
live in `details.sources` and `details.images`. They are display attachments for
that row and do not become separate top-level timeline entries unless the
runtime emits separate activity events for them.

Safe model reasoning summaries are also activity items. Internal reasoning
traces do not cross the protocol unless partner AI core explicitly maps them into
safe `sidechat.activity` text. Tool progress such as web search is typed as
activity, never inferred from natural-language strings.

Final assistant answer text is still streamed through assistant message events
such as deltas and rendered separately from activity.

## Target Workflow Activity

The target harness adds multi-agent workflow progress without exposing provider
or AI SDK internals. Workflow events should let the widget show long-running
agent work while preserving stable product semantics.

Future protocol concepts:

- workflow run started/completed/failed/aborted;
- workflow node started/progress/completed/failed;
- node activity linked to an agent profile, tool, retrieval task, compaction
  task, or verifier task;
- handoff artifacts such as summaries, findings, citations, plans, and review
  results;
- stable event ids for reconnect/resume if SSE remains the transport.

The protocol should still carry product DTOs only. It must not expose provider
stream parts, AI SDK messages, database rows, Effect objects, or internal
workflow implementation details.
