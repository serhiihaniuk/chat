# 36 — Observability foundation + dev console logs

**Epic:** 5 Robustness | **Priority:** P0 (owner feature + prerequisite for 26/27's logging) | **Depends on:** — (do BEFORE 26 and 27; they log through this) | **Status:** todo

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

- [ ] Fresh `npm run dev`: the console shows the boot summary and a complete, readable turn lifecycle for every message sent — no extra flags needed.
- [ ] `SIDECHAT_LOG_LEVEL=debug` shows per-event detail; `=warn` silences routine traffic.
- [ ] No prompt/model text, tool payloads, or secrets appear at ANY level (test with a turn containing a tool call; grep captured output for the fake tool's payload).
- [ ] A throwing logger or sink never affects a turn (fail-open unit test; complements plan/27's core fix).
- [ ] Production profile defaults: JSON lines, NOOP telemetry sink; explicit `options.observability` still wins.
- [ ] Gate-clean: `process.env` reads stay in the config adapter; `shared` stays zero-dep; db imports only the shared type.

## Verification

```sh
npm test --workspace @side-chat/shared
npm test --workspace @side-chat/partner-ai-service
node scripts/run-local-fake.mjs --yes   # watch the console
npm run verify
```
