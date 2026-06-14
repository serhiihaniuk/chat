# ADR 0004: Product Protocol

Status: accepted

`sidechat.v1` is the product protocol. Service routes, streaming events, client behavior, widget projection, generated JSON Schema, and OpenAPI artifacts must move together.

Assistant activity is part of the product protocol. The browser-facing Thinking
timeline is driven by `sidechat.activity`, not provider-native stream parts,
frontend string heuristics, or separate client-only tool/reasoning structures.

Ad hoc service/client DTOs are rejected because they allow compatibility drift between the widget, browser fixtures, service, and future partner integrations.
