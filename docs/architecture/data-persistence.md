# Data Persistence

Day-one production persistence is Postgres plus Drizzle in `packages/db`.

Runtime composition rules:

- development and test may use memory repositories;
- production requires `SIDECHAT_DATABASE_URL`;
- production selects the Postgres/Drizzle repository adapter;
- missing production persistence fails closed during config/composition.

The repository contract covers conversations, messages, assistant turns, context snapshots, usage, tool invocations, host command results, and audit events. Memory repositories are local/test adapters, not production fallbacks.
