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

DO $$
BEGIN
  CREATE ROLE sidechat_maintenance NOLOGIN;
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

-- The Workflow journal sweep connects to this same database as a maintenance
-- principal (its DML lives on the `workflow` schema). It only reads the sidechat
-- side to decide eligibility: the sweep joins `assistant_turns`, `conversations`,
-- and `conversation_title_runs` to prune only terminal, non-held turn and title
-- runs. It row-locks only `workflow_run` (which it owns), so plain SELECT on the
-- sidechat tables is enough — deliberately no UPDATE, which would let the sweep
-- principal tamper with legal_hold. Grant that read and no more, so the
-- least-privilege split does not make the sweep fail silently.
GRANT USAGE ON SCHEMA sidechat TO sidechat_maintenance;
GRANT SELECT ON sidechat.assistant_turns TO sidechat_maintenance;
GRANT SELECT ON sidechat.conversations TO sidechat_maintenance;
GRANT SELECT ON sidechat.conversation_title_runs TO sidechat_maintenance;
