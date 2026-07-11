# ADR 0015: Use the Native UI Stream, Tools, and Approval Vocabulary

Status: accepted 2026-07-11; target-state implementation pending

Supersedes: ADR 0004 and ADR 0009 at the v7 cutover. Amends the live-state portion of ADR 0012.

## Context

`sidechat.v1` currently owns a custom request/event union, validators, SSE codec, activity vocabulary, transport errors, and a RuntimeEvent-to-wire mapping. Host commands add a second custom tool lifecycle so a browser result can find an in-memory waiter on the owning service instance.

AI SDK 7 publishes a versioned UI message stream and typed parts for text, reasoning, tools, approvals, sources, files, errors, abort, and finish. `useChat` consumes that protocol directly. Dynamic/client tools represent the existing host-command use case without a Side Chat-specific model-facing vocabulary.

## Decision

The public stream contract is AI SDK UI message stream `v1`, identified by `x-vercel-ai-ui-message-stream: v1`, plus a narrow Side Chat profile:

- Native parts own content, reasoning, tool input/output, approval, source/file, abort, step, and finish semantics.
- Side Chat adds no custom `data-*` part at baseline. The dynamic-tool part already carries the dispatch identity needed by host integration, and turn state derives from HTTP status plus native start/finish/abort parts.
- Adding a future `data-*` part requires a named consumer, a schema, a privacy review, and evidence that native parts cannot express the concept.
- The browser uses `useChat` and the selected native transport. It does not rebuild the old reducer, dense sequence protocol, or recovery markers.
- Browser-executed page capabilities are client tools. “Host command” retires from model/runtime vocabulary; `host-bridge` remains the browser security/integration boundary.
- Side Chat validates ownership, tool-call identity, result shape, timeout, and exactly-once settlement before a client-tool result reaches an agent.

## Approval policy

The current configured production/fake tool inventory contains one server tool, `mock_web_search`, and no host commands. Example/fixture tools are not shipped capabilities but establish the policy categories.

| Tool or category                   | Policy                                     | Reason                                                                |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `mock_web_search`                  | Ungated                                    | Read-only demonstration/search behavior; no external mutation.        |
| `jira.search_issues` example       | Ungated if adopted unchanged               | Read-only lookup. It is not currently configured.                     |
| `jira.create_issue` fixture        | Always gated if adopted                    | Creates external state. It is currently test-only.                    |
| New mutating server or client tool | Always gated by default                    | External writes require explicit user intent and audit.               |
| Mixed read/write tool              | Per-input decision                         | Safe reads may proceed; mutating inputs require approval.             |
| New read-only tool                 | Ungated only after explicit classification | Prevents an unreviewed tool from silently gaining mutation authority. |

The authenticated conversation owner is the initial approver. The audit row stores approver, tenant, conversation, turn, tool and call ids, input digest, decision, optional reason, and request/decision/expiry timestamps. It never duplicates raw tool input. Durable approval expires after 24 hours unless configuration narrows it.

WorkflowAgent's pinned compiled path currently documents that `needsApproval` can be ignored. Therefore native approval part shapes are the wire vocabulary, but a Side Chat durable hook gate must precede every gated side effect until the exact compiled-path conformance test proves native enforcement. Authentication and HMAC do not replace that execution barrier.

## Client availability policy

- On the Workflow substrate, a client tool waits durably for reattachment up to its configured timeout. Result persistence precedes hook resumption, so result-before-hook races cannot lose data.
- On ToolLoopAgent fallback, no connected client produces an immediate typed result. The system does not rebuild polling, notification relay, or an in-memory cross-instance waiter.

## Public error profile

Every error part carries a safe code/message and retryability. Raw provider, database, prompt, and tool payload text is forbidden.

| Code                   | Retryable | Safe meaning                                       |
| ---------------------- | --------- | -------------------------------------------------- |
| `bad_request`          | no        | The request is invalid.                            |
| `unauthorized`         | no        | Authentication is required.                        |
| `forbidden`            | no        | The caller may not perform this action.            |
| `not_found`            | no        | The requested resource is unavailable.             |
| `conflict`             | yes       | Current conversation state prevents the operation. |
| `rate_limited`         | yes       | Capacity or provider limits rejected the attempt.  |
| `aborted`              | no        | The user or system cancelled the turn.             |
| `timeout`              | yes       | A bounded operation exceeded its deadline.         |
| `provider_failed`      | yes       | The model provider failed safely.                  |
| `tool_failed`          | no        | A tool failed and cannot be retried automatically. |
| `persistence_failed`   | yes       | Durable state could not be written.                |
| `internal_error`       | yes       | An unexpected safe server failure occurred.        |
| `unsupported_protocol` | no        | Client and service stream versions do not match.   |

`malformed_stream` becomes a local client/diagnostic classification rather than a server product code. `replay_expired`, `stream_unavailable`, and `not_stream_owner` retire with the old connection-bound resumability handshake.

## Feature disposition

| Current feature                                           | Target disposition          | User-visible consequence                                                                                                        |
| --------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Text/reasoning/tool timeline                              | Rebuild from native parts   | Same concepts, SDK-native lifecycle names.                                                                                      |
| First-successful-exchange conversation title              | Keep and isolate            | The title appears once; title failure or timeout never changes the turn.                                                        |
| Content-filter safety terminal and filtered output        | Redesign with native finish | The stream ends with `finish(content-filter)`; history records the blocked outcome without retaining filtered assistant output. |
| User cancellation terminal                                | Redesign with native abort  | Stop is a calm cancelled state, not an error card; partial output remains stream-only.                                          |
| Tool-step limit terminal                                  | Redesign as native length   | A capped loop completes with `finish(length)` so the widget can explain truncation.                                             |
| Per-turn usage totals and available token details         | Keep                        | Usage remains attributable to one turn; supported reasoning and cached-input details are not silently zeroed.                   |
| Custom generic activity/progress rows                     | Delete                      | No synthetic progress row without a real native event.                                                                          |
| Provider payload metadata in activities                   | Delete                      | Internal/provider details never reach the widget.                                                                               |
| Dense protocol sequence numbers                           | Delete                      | Native part ids/framing and reconnect normalization own ordering.                                                               |
| Same-instance resume handshake and transport error ladder | Replace with native replay  | Workflow run replay supports reconnect and multiple subscribers without owner-instance errors.                                  |
| Local run markers, watchdog/backoff/poll recovery ladder  | Delete                      | Active-turn discovery plus native transport/reconnect replaces it.                                                              |
| Custom host-command event/result vocabulary               | Delete                      | Dynamic/client-tool parts and authenticated result handling replace it.                                                         |
| Component library, themes, approval/tool cards            | Keep and adapt              | Visual product behavior remains, driven by native parts.                                                                        |

## Consequences

Widget and service protocol versions move together. Side Chat gives up independent ownership of the base event grammar and gains deletion of the custom protocol, double mapper, host-command relay, and most live-state machinery. The Side Chat profile remains deliberately small; recreating a shadow event system under `data-*` would violate this decision.
