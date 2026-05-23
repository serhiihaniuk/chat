# ADR 0007: Database Boundary

Status: accepted

`packages/db` owns persistence contracts and implementations. Production uses Postgres plus Drizzle; memory repositories exist only for tests and local development.

The partner service composition root selects persistence from environment. Production without a database URL fails closed instead of silently falling back to memory.
