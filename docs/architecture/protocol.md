# Protocol

`sidechat.v1` is the product boundary between service, client, widget, and harness. It defines chat requests, model metadata, history, usage summaries, streaming events, terminal events, and SSE encoding.

Generated artifacts are required:

- `packages/chat-protocol/src/generated/sidechat-v1.schema.generated.json`
- `docs/generated/partner-ai-service.openapi.generated.json`

`scripts/check-generated-artifacts.mjs` fails when these artifacts are missing or malformed. Protocol changes should update runtime codecs, tests, and generated artifacts together.
