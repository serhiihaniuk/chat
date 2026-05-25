# Repository Validation Status

Date: 2026-05-25

Scope: current repository state after the widget/runtime refactor, OpenAI local
service wiring, and backend mocked web-search tool work.

## Verdict

The validation register is currently green under the pinned runtime. The old
blocking findings about fake-only service composition, a local `ToolLoopAgent`
facade, skipped-test aliases, and weak lint severity have been closed.

Current baseline:

- `npm run verify` is the repository gate and runs Oxfmt, Oxlint with
  `--deny-warnings`, typecheck, Vitest, build, and custom governance checks.
- The service composes `partner-ai-core`, `agent-runtime`, auth, policy,
  persistence, model/provider selection, and tool registry wiring from the
  composition root.
- Local `.env` service mode can run OpenAI through `SIDECHAT_PROVIDER=openai`,
  `SIDECHAT_ALLOWED_MODELS`, `SIDECHAT_OPENAI_API_KEY`, and OpenAI reasoning
  controls. Fake provider mode remains explicit for deterministic tests and
  development fixtures.
- The default local OpenAI model configuration uses `gpt-5.4-mini` with medium
  reasoning effort and automatic reasoning summary unless env overrides are
  supplied.
- The agent runtime uses AI SDK `ToolLoopAgent` as the orchestration boundary
  and emits normalized runtime events.
- A backend `mock_web_search` tool is registered by the service. It simulates web
  search without external egress, emits ordered `sidechat.activity` progress and
  tool rows, and feeds the mocked result back into the assistant context.
- `sidechat.activity` is the canonical assistant-activity protocol event. Tool
  parameters, results, errors, and sources live under `details.tool`, allowing
  the widget to render a stable AI Elements-style timeline without provider
  native payloads.
- The widget uses the refactored prompt input, model picker, context control,
  reasoning display, source/tool surfaces, and resizable panel. It intentionally
  keeps the accepted AI Elements/shadcn-derived package dependencies needed by
  the current component implementation.
- `.github` workflows are not part of the repository state. Validation is
  documented as a local/pipeline command contract, not as a checked-in GitHub
  Actions workflow.

## Validation Evidence

- `npx -p node@24.16.0 -p npm@11.15.0 npm run verify`: pass under the pinned
  Node/npm runtime.
- API health smoke against the local service reported `providerId:"openai"`,
  `modelId:"gpt-5.4-mini"`, and `persistence:"postgres-drizzle"` with no secret
  values exposed.
- API stream smoke for a search-style prompt emitted ordered `sidechat.activity`
  progress/tool events for the backend mock web-search tool, plus streamed
  assistant output.

## Known Residuals

- Browser automation against the current in-app URL was blocked by the app
  browser policy, so the latest verification used API smoke plus repository
  tests rather than an automated visual click-through.
- `docs/CONTEXT.md` now exists as the quick durable context layer. Keep it in
  sync when architecture, widget, backend, runtime, protocol, or DB direction
  changes.

## Operator Notes

- Use `npm install` from the root. Do not reintroduce pnpm.
- Use `npx -p node@24.16.0 -p npm@11.15.0 npm run verify` when the active shell
  is not already on the pinned runtime.
- Use `npm run smoke:provider:openai` only with explicit credentials and
  `SIDECHAT_LIVE_PROVIDER_SMOKE=approved`.
