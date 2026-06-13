# Data Persistence

Production persistence is Postgres plus Drizzle in `packages/db`.

Runtime composition rules:

- development and test may use memory repositories;
- production requires `SIDECHAT_DATABASE_URL`;
- production selects the Postgres/Drizzle repository adapter;
- missing production persistence fails closed during config/composition.

The repository contract currently covers conversations, messages, assistant
turns, context snapshots, usage, tool invocations, host command results, and
audit events. Memory repositories are local/test adapters, not production
fallbacks.

## Target Persistence Model

The target harness treats persistence as the turn ledger, not as a post-stream
cleanup step. `partner-ai-core` should start an assistant turn before model
execution, record the prepared context manifest before runtime execution, persist
runtime/tool/workflow events as they happen, and complete or fail the turn from
terminal runtime state.

Future records should cover:

- host capability manifest versions and hashes;
- assistant profile versions and prompt hashes;
- context candidates, rendered context hashes, and context manifests;
- conversation summaries and compaction checkpoints;
- memory records, supersession, provenance, and selection decisions;
- retrieval sources, chunks, embeddings, retrieval results, and citations;
- workflow runs, workflow nodes, handoff artifacts, retries, and node terminal
  states;
- tool result summaries, full-result references, and approval records;
- eval runs and scores linked to turns, prompts, retrieval, memory, and
  workflows.

The database should remain behind repository interfaces. Product workflows in
`partner-ai-core` should depend on Effect-shaped ports, while concrete Postgres
and memory adapters live outside the core harness.
