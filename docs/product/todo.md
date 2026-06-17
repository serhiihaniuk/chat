# Product TODO

Read this when: a capability idea is intentionally deferred.
Source of truth for: product work that should not appear as active runtime
configuration or public contracts yet.
Not source of truth for: implemented behavior, package ownership, or lifecycle
order.

## Context Management

- History summary context, working name `recent_plus_summary`: support long
  conversations by admitting recent same-conversation messages and a generated
  summary of older history. Before reintroducing this as configuration, define
  the summary generation owner, persistence timing, refresh policy, token budget
  accounting, health diagnostics, and tests that prove only authorized history
  can become model-visible context.
- Long-term memory and retrieval context: persist durable user, workspace, or
  project facts and admit retrieved knowledge into model context. Before
  reintroducing DB schema, capability source types, configuration, or manifests
  for this, define the data model, write ownership, retention and deletion
  policy, tenant/subject authorization, retrieval strategy, redaction and audit
  behavior, token budgeting, and tests that prove only authorized memory can
  become model-visible context.
