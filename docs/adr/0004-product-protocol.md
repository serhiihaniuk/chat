# ADR 0004: Product Protocol

Status: accepted

`sidechat.v1` is the product protocol. Service routes, streaming events, client behavior, widget projection, generated JSON Schema, and OpenAPI artifacts must move together.

Ad hoc service/client DTOs are rejected because they allow compatibility drift between the widget, harness, service, and future partner integrations.
