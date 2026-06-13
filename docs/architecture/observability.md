# Observability

Observability is request, turn, stream, persistence, policy, context, retrieval,
memory, workflow, runtime, tool, cost, quality, and audit oriented.

The service exposes health/readiness with runtime and persistence labels.
Backend core records stream lifecycle events through Effect-shaped ports, while
the service persistence adapter records durable audit events and usage.
`agent-runtime` may attach spans around provider stream setup, runtime tools,
and runtime event mapping, but provider-native payloads must stay inside the
runtime package.

Redaction happens before persisted or emitted diagnostic payloads cross app
boundaries. External telemetry export is an adapter concern and remains outside
pure partner AI core and browser packages.

Effect defects and typed failures should be observable differently. Typed
failures are expected product/runtime outcomes; defects indicate crashed code and
should be mapped at package boundaries before they reach HTTP or protocol
surfaces.

## Target Turn Reconstruction

Every assistant turn and workflow node should be reconstructable from durable
records plus telemetry:

- request id, conversation id, assistant turn id, workflow run id, and node id;
- host capability manifest hash;
- assistant profile id/version and prompt hash;
- policy decision for model, tools, commands, retrieval, memory, and workflow;
- context manifest and rendered context hash;
- retrieval queries, selected chunks, citations, and rerank metadata;
- selected memory ids and supersession state;
- provider request metadata, first-token latency, token usage, and cost;
- tool calls, inputs/results hashes, sources, durations, and failures;
- workflow handoff artifacts and node terminal states;
- final terminal status and user/eval feedback.

Effect logging, tracing, metrics, scoped layers, and typed failures should be the
default server/core observability model. External telemetry export remains an
adapter concern.
