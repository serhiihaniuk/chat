# Agent Runtime

The agent runtime uses AI SDK as the model orchestration engine. Provider-specific code stays at the adapter edge; partner AI core receives normalized runtime events and usage data.

The OpenAI Responses adapter uses `@ai-sdk/openai` and the shared AI SDK engine. Raw provider stream shapes and direct provider HTTP calls must not leak into protocol, client, widget, partner AI core, or service route code.

Default tests use fake providers and mocked AI SDK streams. Live provider smoke tests require explicit credentials and a separate data-use review.
