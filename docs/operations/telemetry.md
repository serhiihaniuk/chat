# Telemetry and observability

Read this when: operating the replacement service or adding a telemetry sink.
Source of truth for: emitted signal meanings, bounded labels, privacy rules, and exporter posture.
Not source of truth for: business analytics, provider configuration, or verification commands.

The service emits content-free lifecycle records. The SDK bridge covers model,
step, and tool execution. Service-owned records cover admission, browser tools,
approvals, streaming, persistence maintenance, and stuck Workflow runs.

## Signal inventory

| Signal group                                    | What it means                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai.operation.*`                                | One AI SDK operation started, ended, aborted, or failed. End records may include the finish reason and final-step performance.                                    |
| `ai.step.*`                                     | A model/tool step started or ended. The pinned Workflow bridge supplies only the fields proven by its compatibility tests.                                        |
| `ai.language_model.*`                           | A provider model call started or ended. End records include available bounded timing and finish-reason fields.                                                    |
| `ai.tool.*`                                     | A server tool execution started or ended. Outcome and tool name are bounded labels; inputs and outputs are never recorded.                                        |
| `capacity.*`                                    | An admission was accepted, queued, or rejected; active and queued counts changed; or a queued request completed its wait.                                         |
| `client_tool.wait` / `client_tool.output`       | A browser-tool wait started, timed out, or was cancelled, or a submitted result settled, duplicated, or arrived late. Payloads and call identifiers are excluded. |
| `tool_approval.wait` / `tool_approval.decision` | An approval was requested, approved, denied, expired, duplicated, conflicted, or arrived late. Approval input is excluded.                                        |
| `stream.*`                                      | A reconnect, keepalive write, unknown chunk scrub, or duplicate terminal occurred.                                                                                |
| `persistence.history_drift`                     | Stored message data failed current validation and was safely degraded during read.                                                                                |
| `workflow.journal_prune*`                       | A journal sweep completed or failed. Successful records report bounded aggregate counts and any measured byte total.                                              |
| `workflow.nonterminal_stuck`                    | The oldest non-terminal run exceeded the largest configured wait plus grace. This alerts only; it never deletes the run.                                          |

The stuck-run alarm reports age and the oldest start timestamp without a run,
turn, conversation, workspace, or user identifier. Normal long waits below the
threshold do not emit the alarm.

## Labels and privacy

Only `providerKind`, `modelAlias`, `outcomeTag`, `toolName`, and `operation` may
be labels. A shared allowlist and mixed-scenario test reject every other label
name. Identifiers are not labels and are not copied into record fields.

Telemetry never includes prompts, message or reasoning content, tool inputs or
outputs, host payloads, approval input, secrets, database URLs, or raw provider
and database errors. The test collector searches every record for sentinel
values carried through those paths.

## Sinks and failure behavior

`off` discards records. `console` writes one structured, redacted record for
local inspection. Tests use the in-memory collector. Sink failures are swallowed
at the telemetry boundary, so instrumentation cannot change a product outcome.

`otlp` is optional and loaded only when configured. The current `@ai-sdk/otel`
integration exports traces; it is not a general metrics exporter. The service
boots and runs without that package path being loaded. The pinned Workflow
bridge is approximately compatible with the AI SDK telemetry interface, so the
collector remains the authoritative verification surface for delivered events.

Direct `console` calls are legitimate only in the console telemetry sink and
explicit test probes. Product routes and workflows emit through `TelemetrySink`.
