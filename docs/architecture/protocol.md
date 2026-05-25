# Protocol

`sidechat.v1` is the product boundary between service, client, widget, and harness. It defines chat requests, model metadata, history, usage summaries, streaming events, terminal events, and SSE encoding.

Generated artifacts are required:

- `packages/chat-protocol/src/generated/sidechat-v1.schema.generated.json`
- `docs/generated/partner-ai-service.openapi.generated.json`

`scripts/check-generated-artifacts.mjs` fails when these artifacts are missing or malformed. Protocol changes should update runtime codecs, tests, and generated artifacts together.

## Current Event Notes

Protocol event type strings are centralized in `SIDECHAT_EVENT_TYPES`. Product
code should import those constants instead of repeating strings such as
`sidechat.tool` or `sidechat.host_command`.

`ToolEvent` represents backend runtime tool activity, not provider-native UI
parts. It currently carries:

- `toolCallId`
- `toolName`
- `status`
- optional `input`
- optional `result`
- optional `errorCode`

`input` and `result` are JSON objects after redaction/mapping at the runtime
boundary. The widget may display them, but it must not infer provider SDK shapes
from them.
