# Agent Runtime

The agent runtime uses AI SDK as the model orchestration engine. Provider-specific code stays at the adapter edge; partner AI core receives normalized runtime events and usage data.

The OpenAI Responses adapter uses `@ai-sdk/openai` and the shared AI SDK engine. Raw provider stream shapes and direct provider HTTP calls must not leak into protocol, client, widget, partner AI core, or service route code.

The current service composition can run OpenAI locally from env configuration.
`SIDECHAT_PROVIDER=openai`, `SIDECHAT_OPENAI_API_KEY`, `SIDECHAT_ALLOWED_MODELS`,
and the OpenAI reasoning env keys select the real provider path. Fake providers
and mocked AI SDK streams remain deterministic test and fixture paths.

Runtime tools are backend-owned capabilities registered in the runtime/tool
registry. The current accepted development tool is `mock_web_search`: it accepts
a search-style input, streams progress as normal assistant deltas, emits
normalized runtime tool call/result events, and returns deterministic assistant
context without external network egress.

Provider-native tool calls, AI SDK UI message parts, and raw tool payloads stay
inside `agent-runtime`. Partner AI core maps normalized runtime tool events into
`sidechat.tool`, and the widget renders the protocol event through its tool UI.

Live provider smoke tests require explicit credentials and data-use approval.
