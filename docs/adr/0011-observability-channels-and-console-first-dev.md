# ADR 0011: Observability — Two Channels, Console-First Development

Status: accepted 2026-07-02 (implementation tracked in `plan/36`; fail-open fix in `plan/27`)

## Context

The repo ships a redacted, turn-scoped telemetry port (`ObservabilitySinkPort`,
`packages/partner-ai-core/src/services/observability.ts`) — but its default is
a no-op, no sink implementation exists, and nothing else in the system logs at
all. Consequences today: a developer running the app sees a silent console; a
dropped LISTEN connection, a failed finalizer, or a silently swapped config
system leaves no trace; and the one wiring that does exist is fail-closed, so a
flaky sink can kill healthy turns.

The audience constraint shapes everything: adopters are ordinary web devs who
do not know Effect, and this is a template — defaults must be safe, visible,
and vendor-neutral.

## What it buys here

| Capability                                   | How                                                                                                                            | Without it                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **Running the app IS running it with logs.** | Development wires both channels to a pretty console by default; `SIDECHAT_LOG_LEVEL=debug` narrates every event.               | A silent console; debugging by adding `console.log` and reverting it.         |
| **Silent failures become log lines.**        | LISTEN drops/reconnects, fiber and finalizer failures, config fallback, orphan sweeps all speak through the diagnostic logger. | The review's failure class: a deaf listener or stranded turn with zero trace. |
| **Secret-safe by construction.**             | Payload stripping + recursive key redaction run before any sink or logger sees data; no level or flag can reveal prompts.      | One verbose flag away from prompts in log aggregators.                        |
| **Vendor-neutral telemetry.**                | One sink port; console/OTel/Datadog are adapters an adopter writes in a few lines (`Effect.sync`/`tryPromise`).                | An APM SDK welded into a template.                                            |
| **A broken sink can't break chat.**          | Fail-open on both channels (`plan/27`).                                                                                        | Telemetry outages becoming product outages.                                   |

## Decision

**Two complementary channels, one redaction discipline:**

1. **Domain telemetry** — the existing `ObservabilitySinkPort` stays the
   canonical seam for turn- and transport-scoped lifecycle records
   (`received`, `started`, `runtime_event`, terminals, subscriber and replay
   lifecycle). Records remain secret-safe by construction (payload stripping +
   recursive key redaction) before any sink runs.
2. **Operational diagnostics** — a new leveled logger for events that have no
   turn: boot summary (selected config, profile, provider/models, persistence),
   config-load failures, LISTEN connect/drop/reconnect, generation-fiber and
   finalizer failures, orphan sweeps, shutdown. The contract is a plain
   synchronous interface (`debug/info/warn/error` + structured fields) defined
   in `@side-chat/shared` (zero-dep), so `db`, core, and the service can all
   accept it without new dependencies and without Effect.

**Console-first defaults, selected by profile:**

- **Development:** both channels write to the console — diagnostics as pretty
  one-line output, telemetry records as compact one-line summaries. Running the
  app IS running it with logs; `SIDECHAT_LOG_LEVEL=debug` adds per-event
  detail (each runtime event, subscriber churn, host-command settle).
- **Production:** diagnostics as JSON lines at `info`; telemetry defaults to
  the no-op sink until the adopter installs a real one.
- Level and format are config keys in `sidechat.config.ts` (`readEnv`
  references, per the config-driven rule) — never ad-hoc `process.env` reads.

**Invariants:**

- **Fail-open, both channels.** A sink or logger failure may lose a record; it
  must never reject a request, abort a stream, or crash the process.
- **Redaction is unconditional.** No log level or flag reveals prompts, model
  output, tool payloads, or secrets. Deep content debugging uses the fake
  provider, not a verbosity switch.
- **The sink stays the vendor seam.** Adapters (OTel, Datadog, console) are
  implementations of the port; the port never grows vendor types.

## Alternatives rejected

- **Adopting the OpenTelemetry SDK directly** — a heavy default dependency for
  a template; every record maps cleanly to a span/log inside an adopter's sink
  when they want it.
- **Effect Logger / Metric / withSpan as the public surface** — ties the most
  approachable seam to the least approachable library; Effect may still be used
  internally later, but the contracts stay plain.
- **One merged channel** — forcing boot/connection diagnostics into the
  turn-scoped `ObservabilityRecord` vocabulary would corrupt it; two small
  vocabularies beat one wrong one.
- **An "unsafe verbose" toggle that logs content** — rejected; redaction is the
  product's promise, and a template default that can leak prompts is a trap.
- **Native metrics (counters/histograms)** — deferred; records carry
  `latencyMs` and error codes, so sinks can derive metrics until a real need
  appears.

## Consequences

Developers get a readable live console by default, and operators get JSON
diagnostics plus a single, documented seam for real telemetry. The silent
failure modes the 2026-07-01 review found (deaf LISTEN connections, unobserved
finalizer failures, silent config fallback) all gain a mandatory log line —
stories `plan/26`, `plan/27`, and `plan/12` reference the logger this ADR
introduces. Cost: one more small port threaded through composition, and a
discipline that new "interesting" events must pick the correct channel.
