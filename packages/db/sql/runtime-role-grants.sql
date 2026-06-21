-- Sidechat role policy and least-privilege grants.
--
-- drizzle-kit owns table DDL (the generated migration); it does not manage
-- Postgres roles or grants. This file is the durable source for the sidechat
-- role policy and is applied after the generated migration on every reset
-- (see scripts/lib/apply-sidechat-schema.mjs). The schema itself is created by
-- the apply layer because the generated migration assumes it already exists.

DO $$
BEGIN
  CREATE ROLE sidechat_owner NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE ROLE sidechat_migrator NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE ROLE sidechat_runtime NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Runtime gets data access only — never CREATE on the schema.
GRANT USAGE ON SCHEMA sidechat TO sidechat_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA sidechat
  TO sidechat_runtime;

-- Migrator owns DDL.
GRANT USAGE, CREATE ON SCHEMA sidechat TO sidechat_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA sidechat TO sidechat_migrator;
