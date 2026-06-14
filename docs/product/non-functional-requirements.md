# Non-Functional Requirements

Read this when: you need the quality bar for Side Chat changes.
Source of truth for: readability, safety, reliability, and verification
requirements.
Not source of truth for: feature behavior or package ownership.

## Human-Readability Quality Gate

- Code must be readable by a lower-context human maintainer.
- Changed spine functions should read top-down through named lifecycle stages.
- Avoid inside-out Effect, Stream, Promise, JSX, and callback expressions.
- Keep ordinary changed functions near cognitive complexity 7 when practical.
- Keep Effect, Stream, AI SDK, protocol, and React state/effect functions near
  5-6 when practical.

## Documentation Usability

- One document has one job.
- Canonical vocabulary lives in `docs/domain/vocabulary.md`.
- Lifecycle order lives in `docs/domain/lifecycle.md`.
- Package READMEs are local package cards.
- Durable docs should use short paragraphs, tables, and compact flows.

## TypeScript And Static Safety

- TypeScript remains strict with exact optional properties, unchecked index
  access checks, isolated modules, and verbatim module syntax.
- Constants use exported uppercase constant objects and uppercase properties.
- Unsafe double assertions are forbidden.
- Generated files must stay generated and should not be hand-edited.

## Boundary Safety

- Hono stays in `apps/partner-ai-service`.
- Drizzle/Postgres stay in `packages/db`.
- AI SDK/provider details stay in `packages/agent-runtime`.
- Effect stays in server/core/runtime packages and must not leak to browser APIs.
- Browser-facing types stay in `chat-protocol`, `chat-client`, and the widget.

## Protocol Stability

- `sidechat.v1` is a product contract.
- Protocol event strings come from centralized constants.
- Runtime events and provider-native parts are not protocol events.
- SSE encode/decode and sequence behavior must be covered by tests.

## Runtime And Provider Privacy

- Provider DTOs, AI SDK stream parts, and raw provider errors are private to
  `agent-runtime`.
- Tool failures become stable runtime/protocol activity shapes.
- Development-only tools are explicit and fail closed in production profiles.

## Error And Terminal Lifecycle Reliability

- Pre-start failures reject the request before `sidechat.started`.
- Post-start failures emit exactly one terminal `sidechat.error`.
- Successful streams emit exactly one `sidechat.completed`.
- Abort/cancel paths must not be reported as successful completion.

## Observability

- Observability records lifecycle facts without changing product behavior.
- Redaction must happen before sensitive fields are logged.
- Logs and test reports should use canonical vocabulary.

## Testability

- Tests should describe scenarios and visible contracts.
- Unit tests cover mapping and policy decisions.
- Integration tests cover service adapters and repository contracts.
- E2E tests cover browser-visible widget behavior.
- Governance tests cover boundary and readability failures.

## Security And Privacy

- Request authority is checked before persistence or runtime execution.
- Secrets must not be committed or copied into docs.
- Host context and retrieved context must be authorized and redacted before the
  model sees it.

## Performance And Streaming Responsiveness

- Stream setup should send `sidechat.started` only after product setup is valid.
- Long-running tools must remain cancellable through runtime/tool boundaries.
- UI state updates should avoid unnecessary re-render loops.

## Accessibility And UI Usability

- Widget controls must remain keyboard and screen-reader accessible.
- Activity, error, and terminal states must be visible to the user.
- Copied visual primitives under `shared/ai/**` are not a style source for
  project-owned behavior.

## AI-Generated-Code Resistance

- The repo rejects dense AI-shaped code even when static checks pass.
- `.agents/skills/side-chat-code-quality-gate/SKILL.md` is the review gate for
  readability and documentation quality.
- `scripts/check-human-readability.mjs` catches obvious docs/code/comment
  failures and teaches the preferred fix.
