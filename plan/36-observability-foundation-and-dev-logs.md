# 36 — Observability foundation + dev console logs

**Epic:** 5 Robustness | **Priority:** P0 (owner feature + prerequisite for 26/27's logging) | **Depends on:** — (do BEFORE 26 and 27; they log through this) | **Status:** done

## Problem

Designed in **ADR 0011** (`docs/adr/0011-observability-channels-and-console-first-dev.md`) — read it first; this story implements it.

Today the app is silent: the telemetry sink defaults to NOOP with no shipped implementation, and nothing logs at all (the only `console.error` is in `server.ts` error paths). A developer running the app cannot see turns happening; a dropped LISTEN connection or failed finalizer leaves no trace; the config loader falls back silently. The owner's explicit feature request: **run the app and see everything in the console while working.**

## Decided approach (ADR 0011)

Two channels: the existing `ObservabilitySinkPort` for turn/transport telemetry records, plus a new plain, synchronous, leveled `DiagnosticLogger` for non-turn events. Console-first by profile: development = pretty one-line console for both channels; production = JSON-lines diagnostics + NOOP telemetry. Fail-open always; redaction unconditional; no OTel dependency.

## Tasks

1. **`DiagnosticLogger` contract in `@side-chat/shared`** (zero-dep, no Effect): `{ debug(msg, fields?); info(...); warn(...); error(...) }` with `fields: JsonObject`. Include a `SILENT_DIAGNOSTIC_LOGGER`. Fields pass through the same key-redaction safety net (move/reuse `redactAttributes` — it lives in core today; either export a copy from shared or have implementations apply it — keep ONE implementation, decide in-story, note the choice).
2. **Console implementations** in the service (`src/adapters/observability/`): `createPrettyConsoleLogger` (time + level + short turn-id + message + compact fields; dev) and `createJsonConsoleLogger` (one JSON object per line; production). Level filtering inside the logger.
3. **Console telemetry sink** (`createConsoleObservabilitySink`): renders each `ObservabilityRecord` as one compact line through the diagnostic logger (`received`/`started`/terminals at `info`; `runtime_event`, `subscriber_*` at `debug`). This replaces the "example sink" idea — it is a real shipped sink that doubles as the adopter recipe.
4. **Config keys** in `sidechat.config.ts`: `environment.logging = { level: readEnv(SIDECHAT_LOG_LEVEL, default "info"), format: readEnv(SIDECHAT_LOG_FORMAT, default by profile: "pretty" in development, "json" in production) }` + `SERVICE_ENV_KEYS` entries. Composition wires: dev profile → pretty logger + console telemetry sink as the DEFAULT `options.observability` (explicit option still wins); production → JSON logger + NOOP sink.
5. **Thread the logger** through composition to the places that must speak (coordinate with stories 26/27/12 — implement the hook points now, even where the deeper fix lands later): boot summary (selected config name, profile, provider + models, persistence kind, port), config-load fallback reason (story 12 makes it fatal; log it loudly meanwhile), LISTEN source connect/error/reconnect (notification sources accept an optional logger — db package gets the shared type only), turn-runner fiber non-interrupt exits, shutdown steps, host-command resolver settle/timeout.
6. **The dev experience** (acceptance-driven): `npm run dev` (or `run-local-fake`) with defaults prints — boot summary; then per turn: received (conversation short-id), started (turn short-id, model), tool/host-command activity (name + status), terminal (status + latencyMs). `SIDECHAT_LOG_LEVEL=debug` adds each runtime event, subscriber attach/detach, replay outcomes, cancel intents. Keep per-delta noise at debug and rely on the 250 ms coalescer (~4 lines/s per streaming turn max).
7. **Docs in the same patch**: update `extension-seams.md` "Add an observability sink" (real sink now exists — point at it), `docs/operations/configuration.md` (logging keys), `docs/operations/local-development.md` ("Run with logs" section: the level/format knobs and what each level shows), vocabulary (`DiagnosticLogger` row). ADR 0011 is already written.
8. Tests: logger level filtering + redaction of sensitive field keys; console sink renders every lifecycle state without throwing; composition defaults by profile (dev gets console sink, production gets NOOP unless overridden); a smoke assertion that a full fake-provider turn produces the expected info-level line sequence.

## Acceptance criteria

- [x] Fresh `npm run dev`: the console shows the boot summary and a complete, readable turn lifecycle for every message sent — no extra flags needed.
- [x] `SIDECHAT_LOG_LEVEL=debug` shows per-event detail; `=warn` silences routine traffic.
- [x] No prompt/model text, tool payloads, or secrets appear at ANY level (test with a turn containing a tool call; grep captured output for the fake tool's payload).
- [x] A throwing logger or sink never affects a turn (fail-open unit test; complements plan/27's core fix).
- [x] Production profile defaults: JSON lines, NOOP telemetry sink; explicit `options.observability` still wins.
- [x] Gate-clean: `process.env` reads stay in the config adapter; `shared` stays zero-dep; db imports only the shared type.

## Verification

```sh
npm test --workspace @side-chat/shared
npm test --workspace @side-chat/partner-ai-service
node scripts/run-local-fake.mjs --yes   # watch the console
npm run verify
```

## Delivery notes

**Two channels, per ADR 0011.**

1. **`DiagnosticLogger`** (`@side-chat/shared`, zero-dep, no Effect) — a plain
   `{debug,info,warn,error}(msg, fields?)` contract + `SILENT_DIAGNOSTIC_LOGGER` +
   `shouldEmitDiagnostic`. `db`, core, and the service all accept it as a type.
2. **`ObservabilitySinkPort`** (existing) stays the turn-scoped telemetry seam.

**One redaction implementation.** Moved `redactAttributes` + `safeJsonPrimitive` +
the sensitive-key list from core into `@side-chat/shared`
(`packages/shared/src/redaction.ts`); core re-exports them so its surface and
`stream-observability.ts` are unchanged. Both channels apply it before any output.

**Console adapters (`apps/partner-ai-service/src/adapters/observability/`).**
`createPrettyConsoleLogger` (time+level+msg+compact fields; dev) and
`createJsonConsoleLogger` (one JSON object/line; prod), both level-filtered and
fail-open (a throwing console/format is swallowed). `createConsoleObservabilitySink`
renders each record as one line — turn lifecycle + tool/host-command activity at
`info`, the raw runtime-event stream + subscriber/replay churn at `debug` — and is
the shipped real sink + adopter recipe. `service-observability.ts` holds the two
profile-default factories (kept the adapter dir at its 5-file budget).

**Config keys.** `environment.logLevel` (`SIDECHAT_LOG_LEVEL`, default `info`) +
`environment.logFormat` (`SIDECHAT_LOG_FORMAT`, default `pretty` in dev / `json` in
prod) as `readEnv` references on all three config files; `readLoggingConfig`
resolves them and fails loud on an invalid value. The options-adapter builds the
logger + the profile-default sink (dev→console, prod→NOOP) and sets them on the
options; an explicit `options.observability` still wins because composition never
overrides a caller sink.

**Threaded hook points.** Boot summary (`server.ts`: config, profile, provider,
model, persistence, port); shutdown steps (start/complete/error, replacing the two
`console.error`s); the three Postgres LISTEN sources (connect `info`, connection
`error` → `warn` — the review's "deaf listener" now speaks, close `debug`; the db
factories take an optional shared-typed logger only); the host-command resolver
(no-client/awaiting/timeout at `debug`). `composePartnerAiService` resolves
`options.diagnosticLogger ?? SILENT_DIAGNOSTIC_LOGGER` and threads it. Also added
host-command name extraction to `toJsonActivityMetadata` so host-command activities
surface their name like tools.

**Deeper fixes stay with 26/27.** Turn-runner fiber non-interrupt exits and the
connect-failure (vs post-connect drop) resilience are the hook points where
plan/26 (Postgres connection resilience) and plan/27 (core fail-open wrapper) land
the deeper handling; story 36 wired the logger to the connection-error listener,
the resolver, boot, and shutdown. Silent config fallback: the legacy parser was
already removed (story 12); the profile→dev and no-DB→memory defaults surface in
the boot summary.

**Tests (in `npm run verify`, 639 passed):** `console-diagnostic-logger.test.ts`
(level filtering, redaction at every level, pretty/json format, stderr routing,
fail-open); `console-observability-sink.test.ts` (every lifecycle state renders,
level mapping, **no payload leak** — a tool `output` in attributes never reaches
the line, fail-open with a throwing logger); `tool-config-registration.test.ts`
config-driven-logging block (format by profile, invalid level rejected, dev→console
/ prod→NOOP default, dev boot writes "turn received"); `shared/index.test.ts`
(redaction recursion, level filter, SILENT logger). Criterion 3's "grep a turn for
the tool payload" is covered deterministically at the sink level (a record carrying
`output: "TOP SECRET…"` renders a line that excludes it).

**Gate-clean:** `process.env` reads stay in the config adapter; `shared` stays
zero-dep (redaction + logger are pure); `db` imports only `type { DiagnosticLogger }`.
`npm run verify` green; real-boot confirmed via the e2e suite (fake-config service
boots + streams with logging active).
