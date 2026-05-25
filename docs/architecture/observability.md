# Observability

Observability is request, turn, stream, persistence, policy, runtime, tool, and
audit oriented.

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
