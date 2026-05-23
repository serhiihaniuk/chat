# Production System Design Review Suggestions

Status: architect/critic consensus review artifact

Reviewed source: [production-system-design.md](production-system-design.md)

This document captures a consensus review between an architect pass and a critic pass. It does not directly change the system design. It lists what should be added, changed, clarified, or deferred before the clean production repo is scaffolded.

## Consensus Summary

The current design has a strong foundation:

- protocol-first product boundary
- no host app in the production repo
- framework-free backend core
- AI SDK 6 treated as backend assistant runtime, not as the browser protocol
- Effect v4 used in backend/core/runtime code, not forced into browser APIs
- explicit package boundaries, public entrypoints, and governance checks
- collocated tests and architecture-aware linting

The main weakness is staging. The document mixes a clean day-one spine with a large future production system. That can make AI agents overbuild providers, tools, billing, MCP, reporting, and infrastructure while still leaving security, auth, privacy, streaming, and production-mode safety too vague.

The consensus direction:

Keep the future architecture as contracts and ADR candidates, but make the day-one scaffold smaller, explicit, fail-closed, and impossible to confuse with production-complete behavior.

## P0 Suggestions

These should be resolved before or during the first clean repo scaffold.

| Suggestion | Justification | Concrete change |
| --- | --- | --- |
| Split day-one spine from future expansion | The current folder trees include future items such as multiple providers, MCP, report generation, billing, and platform-specific infra. Agents may scaffold everything by default. | Add a section/table for each app/package: `required day one`, `interface only`, `deferred until ADR/product need`. Move MCP, report generation, multi-provider concrete adapters, billing routes, external tools, Terraform, and Kubernetes out of required scaffold. |
| Add production fail-closed mode | The design rejects fake production but includes static auth, allow-all billing, fake providers, in-memory rate limits, and permissive local adapters. Without explicit profile rules, these can ship accidentally. | Add environment-profile rules: `production` must refuse to boot with static auth, fake/local provider, in-memory rate limit, fixture persistence, disabled telemetry, permissive CORS, missing secrets, or allow-all entitlement/billing adapters. |
| Decide DB stored-procedure boundary | Existing project context requires stored-procedure/function-only runtime DB access, but the design still leaves direct repository SQL as an open question. | Move stored-procedure-only runtime DB access into current decisions. Direct SQL allowed only in migrations and explicit DB test harnesses. |
| Define minimum `AuthContext` and tenancy contract | History, usage, tools, host context, and conversation ownership depend on tenant scope from day one, even if real Azure SSO comes later. | Define `AuthContext`: `subjectId`, `workspaceId`, `tenantId` or account scope, roles/scopes, auth source, host origin, conversation owner, audit actor, and dev/demo mode constraints. Require cross-tenant denial tests. |
| Add protocol evolution policy | `sidechat.v1` is the product spine, but versioning, additive changes, unknown events, and deprecation are not yet specified. | Add `Protocol Evolution`: version/header negotiation, additive-only patch rules, breaking-change rules, unknown event handling, golden fixture requirements, generated artifact compatibility, deprecation, and `sidechat.v2` triggers. |
| Clarify policy ownership | Backend core, assistant runtime, tools, and adapters can otherwise duplicate or fight over decisions. | Add ownership table: `backend-core` owns product/user/workspace policy and protocol emission; `assistant-runtime` owns model/tool-loop mechanics; outbound adapters own external-call safety, response parsing, retries, and error mapping. |
| Add threat model and trust zones | Security is currently a hardening row, but the system has many trust boundaries: browser, host bridge, API, model provider, MCP, tools, DB, telemetry. | Add trust zones for browser/widget, host bridge, partner API, backend core, assistant runtime, tool adapters, MCP servers, provider APIs, DB, and telemetry. State trust assumptions and denied-by-default behavior. |
| Add data privacy and retention rules | Conversation content, host context, tool results, and provider payloads may include sensitive client/financial data. | Add data classification for prompts, messages, host context, tool results, provider payloads, logs/traces, audit records. Define retention, redaction, deletion/export, provider data-use constraints, regional residency, and no-log fields. |

## P1 Suggestions

These are important, but can be implemented as part of the first few milestones if the day-one contracts do not ship real risky capabilities yet.

| Suggestion | Justification | Concrete change |
| --- | --- | --- |
| Specify streaming semantics | Terminal-event rules exist, but reconnect, duplicate submit, abort, timeout, heartbeat, POST retry, and persistence timing are unspecified. | Add `Streaming Semantics`: event ids, heartbeat interval, abort propagation, timeout behavior, persistence timing, idempotency key per assistant turn, client retry limits, resumability decision, and no automatic retry of side-effecting POST without idempotency. |
| Close host-command feedback loop | The widget dispatches host commands, but backend reconciliation/model-visible results are not decided. | Decide whether host-command results are client-only state, protocol events, or posted through a result route. Require command ids, idempotency, timeout, rejection, replay handling, and audit treatment. |
| Add tool safety categories | Tool behavior has different risks depending on whether it reads, writes, calls external networks, invokes MCP, or asks the host to act. | Categorize tools as read-only, write, sensitive, external-network, host-command, MCP. For each, define approval, audit fields, timeout/retry, idempotency, tenant scope, egress policy, and redaction. Promote to P0 if real tools ship day one. |
| Add observability operations contract | Observability lists signals but not names, redaction, cardinality, dashboards, or alert conditions. | Define required log/metric/trace names for stream success/error/abort, first-token latency, total latency, provider/tool latency, token/cost, rate-limit denials, approval outcomes. Include redaction, sampling, correlation ids, retention, audit separation, and cardinality limits. |
| Define package birth and extraction criteria | The repo is at risk of package explosion. Some packages are justified; others may be premature until reuse exists. | Add criteria: a package exists only when it has a public boundary, independent tests, multiple consumers, or clear architecture enforcement value. Otherwise start app-local behind an interface and extract later. |
| Promote open questions into ADR gates | Some open questions are already represented as concrete folder structures or decisions. This creates ambiguity for AI agents. | Split open questions into `blocks scaffold`, `blocks production`, and `later optimization`. Anything still open must not appear as required day-one scaffold. Require ADRs for blocking decisions. |
| Defer report generation explicitly | Report/PDF generation is listed as a non-goal but appears in assistant-runtime tool templates. | Remove `report-generation` from day-one templates. Add it to `product-approved future tools` only. |
| Add host integration authority rules | Host context and commands are a major trust boundary. Backend should not blindly trust host-provided context. | Define capability negotiation, context freshness, unsupported command result, host-denied actions, command replay/idempotency, and what backend may trust from host context. |

## P2 Suggestions

These are useful before production hardening, but should not block the clean scaffold.

| Suggestion | Justification | Concrete change |
| --- | --- | --- |
| Replace Terraform/Kubernetes defaults with deployment requirements | Platform-specific infra is premature without an accepted production target. | Replace concrete `terraform/` and `k8s/` trees with deployment requirements: stateless service assumptions, migration actor, readiness/liveness, secret source, scaling, rollback, backup/restore, managed service dependencies. Choose platform by ADR later. |
| Keep usage metadata, defer billing product surface | Usage metadata is useful for protocol/runtime accounting, but billing and spend enforcement are larger product capabilities. | Keep token/usage metadata in protocol/runtime. Defer usage routes, billing, spend budgets, and entitlement enforcement unless accepted by ADR. |

## Suggested Staging Model

Use this staging model to revise the main system design.

| Stage | Include | Exclude |
| --- | --- | --- |
| Day-one scaffold | Protocol package, backend-core use case skeleton, assistant-runtime interface/fake provider, partner-ai-service stream route, chat-client stream reader, minimal widget shell, DB migration/repository boundary if persistence is in scope, governance scripts. | Real MCP, report generation, multiple concrete providers, billing UI/routes, production dashboards, platform-specific infra, broad external tools. |
| Interface-only | Provider registry, tool registry, auth/rate/billing ports, telemetry port, host-command result contract, deployment requirements. | Concrete production implementations unless needed for the current milestone. |
| Later by ADR/product need | Azure SSO implementation, Anthropic/Azure/AI Gateway providers, MCP servers, reranking, sensitive tools, billing/spend enforcement, Terraform/Kubernetes, report/PDF generation. | Anything that pretends to be production without real security and ops controls. |

## Suggested Main-Doc Additions

The architect and critic agreed that the main design should gain these new sections or subsections:

1. `Day-One Scaffold vs Later Expansion`
2. `Production Profiles And Fail-Closed Rules`
3. `Protocol Evolution And Compatibility`
4. `AuthContext And Tenancy Contract`
5. `Streaming Semantics`
6. `Policy Ownership`
7. `Threat Model And Trust Zones`
8. `Data Privacy And Retention`
9. `Tool Safety Categories`
10. `Host Integration Authority`
11. `Observability Operations Contract`
12. `Package Birth And Extraction Criteria`
13. `ADR Gates For Open Questions`
14. `Deployment Requirements Before Platform Choice`

## Items To Preserve

Do not weaken these parts of the current design while applying the suggestions:

- the host app remains external
- the browser/backend protocol remains product-owned
- AI SDK 6 remains backend assistant-runtime engine, not browser protocol
- backend-core remains framework-free
- provider-native events and AI SDK UI messages never leak into protocol/widget/client
- Effect v4 is backend/core discipline, not required browser API surface
- tests remain colocated by default
- governance scripts remain first-class architecture protection

## Consensus Notes

The critic argued for reducing the scaffold aggressively to avoid overbuilding. The architect agreed, but kept one important nuance: future-facing interfaces can stay when they protect the architecture from OpenAI-specific or app-local coupling.

Consensus rule:

Interface now when it protects the boundary. Concrete implementation later unless it is required by the current milestone.

