# Functional Requirements

Read this when: you need the final intended product behavior.
Source of truth for: what Side Chat must do.
Not source of truth for: package implementation details or migration plans.

## Product Purpose

Side Chat provides an embeddable assistant harness. A host app can add a chat
widget, expose governed context and commands, and receive a stable streamed
assistant experience without exposing provider internals to the browser.

## Actors And Contexts

| Actor           | Requirement                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------- |
| User            | Can submit messages and see assistant output, activity, tools, sources, and terminal state. |
| Host app        | Owns application data, host commands, and integration surfaces.                             |
| Partner service | Owns HTTP, auth adapters, config, and app composition.                                      |
| Product core    | Owns product policy, context, turn lifecycle, and protocol mapping.                         |
| Agent runtime   | Executes one prepared assistant turn.                                                       |

## Chat Stream Request Behavior

- The browser sends only `sidechat.v1` request payloads.
- The service validates auth, method, request body, and allowed scope before the
  stream is product-started.
- Invalid request setup fails as an HTTP/request error, not a protocol event.
- A valid request produces a streamed `sidechat.v1` event sequence.

## Conversation Behavior

- A conversation belongs to an authorized workspace and optional project.
- A new conversation can be created when the request has no conversation id.
- Existing conversations must be authorized before use.
- The service returns the server conversation id so the widget can continue the
  same thread.

## Assistant Turn Behavior

- Each user message starts at most one active assistant turn in the stream path.
- Product core records turn lifecycle through ports, not direct database access.
- Runtime receives an already prepared request and does not decide product
  authorization, redaction, or persistence.
- Terminal success and terminal error are explicit product states.

## Tool And Activity Behavior

- Tool availability is decided by product policy/profile before runtime
  execution.
- Runtime tools are app-owned capabilities injected into agent runtime.
- Tool activity appears as `sidechat.activity`.
- Tool inputs, outputs, errors, and sources stay inside activity details.
- Development tools such as `mock_web_search` must fail closed in production
  profiles.

## Context And Source Behavior

- Product core owns context gathering, squashing, redaction, authorization,
  prepared context, manifests, and persistence.
- Agent runtime receives only prepared context and renders it for the model.
- Browser-facing source/citation data must be protocol-safe.
- Provider-native context or stream parts must not cross into browser packages.

## Widget Behavior

- The widget shows optimistic user and assistant messages during a stream.
- Activity timeline order follows protocol event sequence.
- Current activity may appear running; completed activity keeps its display
  position.
- Stream errors mark the visible assistant state as failed.
- The widget public API stays React and TypeScript friendly.

## Host Integration Behavior

- The host bridge is the browser seam for host context and host commands.
- Host commands are not runtime tools unless the service explicitly exposes a
  tool adapter for that behavior.
- The repo does not ship a production host app.

## History, Model, And Usage Endpoints

- Resource endpoints remain separate from the stream endpoint.
- Model choices are constrained by service configuration and product policy.
- Usage data is protocol-safe and must not expose provider-native payloads.

## Error Behavior

- Pre-start failures reject setup.
- Post-start failures emit one terminal `sidechat.error`.
- Expected server/core/runtime failures use typed errors.
- Raw provider, database, Hono, or Effect internals do not leak to the protocol.

## Out Of Scope

- A first-party production host app.
- Provider-native browser protocol.
- Production deployment runbooks before a real deployment exists.
- Multi-agent workflows as a raw model-callable tool.
