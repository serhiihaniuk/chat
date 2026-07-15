-- Side Chat runtime reads only Workflow run identity and lifecycle.
--
-- Postgres World creates the workflow schema after Side Chat migrations run,
-- so these grants are intentionally applied as a post-Workflow bootstrap step.
-- Provider input, output, errors, attributes, and journal child tables remain
-- inaccessible to the Side Chat runtime role.

GRANT USAGE ON SCHEMA workflow TO sidechat_runtime;
GRANT SELECT (id, status) ON workflow.workflow_runs TO sidechat_runtime;
