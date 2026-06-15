# Requirements

Read this when: you need the final intended product and quality requirements.
Source of truth for: Side Chat behavior, safety, readability, and adoption
requirements.
Not source of truth for: package ownership tables, implementation plans, or
provider adapter details.

## Functional Requirements

- Side Chat provides an embeddable assistant foundation for ordinary web apps.
- A host app can embed the widget, expose governed context and commands, and
  receive a stable streamed assistant experience.
- The browser sends only `sidechat.v1` request payloads.
- The service validates auth, method, request body, and allowed scope before a
  stream is product-started.
- Invalid setup fails as an HTTP/request error, not a protocol event.
- A valid request produces a streamed `sidechat.v1` event sequence.
- Conversations belong to an authorized workspace and optional project.
- Existing conversations are authorized before use.
- Each user message starts at most one active assistant turn in the stream path.
- Terminal success and terminal error are explicit product states.

## Tool, Context, And Runtime Requirements

- Tool availability is decided by product policy/profile before runtime
  execution.
- Runtime tools are app-owned backend capabilities injected into agent runtime.
- Declared tools are not executable unless a matching RuntimeTool is registered.
- Mutating tools require an explicit approval policy path before execution.
- Host commands are browser/host-app interactions and stay separate from backend
  runtime tools.
- Product core owns context gathering, squashing, redaction, authorization,
  prepared context, manifests, and persistence timing.
- Agent runtime receives only prepared context and renders it for the model.
- Provider-native context, provider stream parts, and raw provider errors never
  cross into browser packages.
- Development tools such as `mock_web_search` fail closed in production
  profiles.

## Quality Requirements

- Code must be readable by a lower-context human maintainer.
- Changed spine functions should read top-down through named lifecycle stages.
- Avoid inside-out Effect, Stream, Promise, JSX, and callback expressions.
- Keep ordinary changed functions near cognitive complexity 7 when practical.
- Keep Effect, Stream, AI SDK, protocol, and React state/effect functions near
  5-6 when practical.
- Docs have one job each and link to canonical docs instead of repeating
  architecture locally.
- Package READMEs are local cards, not global vocabulary dumps.

## Security And Privacy Requirements

- Request authority is checked before persistence, private context, or runtime
  execution.
- Secrets are not committed or copied into docs.
- Host context and admitted context are authorized and redacted before the model
  sees them.
- Redaction happens before sensitive fields are logged.
- Browser-facing source/citation data is protocol-safe.
- Expected server/core/runtime failures use typed errors.

## Protocol And Terminal Requirements

- `sidechat.v1` is a product contract.
- Protocol event strings come from centralized constants.
- SSE encode/decode and sequence behavior are covered by tests.
- Pre-start failures reject request setup.
- Post-start failures emit exactly one terminal `sidechat.error`.
- Successful streams emit exactly one `sidechat.completed`.
- Abort/cancel paths must not be reported as successful completion.

## Adoption And Extension Requirements

- Adopters can find where to add a tool, guard, agent executor, host command,
  policy rule, or observability sink quickly.
- The repo does not ship a production host app.
- Resource endpoints remain separate from the stream endpoint.
- Model choices are constrained by service configuration and product policy.
- Usage data is protocol-safe and does not expose provider-native payloads.
- Widget controls remain keyboard and screen-reader accessible.
- Activity, error, and terminal states are visible to users.
- Copied visual primitives under `shared/ai/**` are not a style source for
  project-owned behavior.

## Out Of Scope

- A first-party production host app.
- Provider-native browser protocol.
- Production deployment runbooks before a real deployment exists.
- Multi-agent workflows as a raw model-callable tool.
