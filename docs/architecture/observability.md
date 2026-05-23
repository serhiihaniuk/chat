# Observability

Observability is request, turn, stream, persistence, policy, and audit oriented.

The service exposes health/readiness with runtime and persistence labels. Backend core records stream lifecycle events through ports, while the service persistence adapter records durable audit events and usage. Redaction happens before persisted or emitted diagnostic payloads cross app boundaries.

External telemetry export is an adapter concern and remains outside pure partner AI core and browser packages.
