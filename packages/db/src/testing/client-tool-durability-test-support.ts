import { Pool } from "pg";

import {
  toActorId,
  toConversationId,
  toSubjectId,
  toToolCallId,
  toWorkspaceId,
  type ClientToolDispatchState,
} from "#schema-contract";
import { createPostgresDrizzleSidechatRepositories } from "#repositories/postgres-drizzle/index";

const TEST_WORKSPACE_ID = "local-workspace";
const TEST_SUBJECT_ID = "local-workspace:subject";

type WorkflowRunDescription = Readonly<{
  hooks: readonly Readonly<{ isSystem: boolean; token: string }>[];
  status: string | undefined;
  steps: readonly Readonly<{ name: string; status: string }>[];
  streams: readonly Readonly<{ bytes: number; name: string }>[];
}>;

/** DB-owned observation seam for the compiled service restart proof. */
export function createClientToolDurabilityProbe(connectionString: string) {
  const repositories = createPostgresDrizzleSidechatRepositories({
    connectionString,
  });
  const observationPool = new Pool({ connectionString });
  return {
    async seedConversation(conversationId: string): Promise<void> {
      await repositories.createOrGetConversation({
        workspaceId: toWorkspaceId(TEST_WORKSPACE_ID),
        subjectId: toSubjectId(TEST_SUBJECT_ID),
        actorId: toActorId(TEST_SUBJECT_ID),
        conversationId: toConversationId(conversationId),
        conversationKey: conversationId,
        now: new Date().toISOString(),
      });
    },
    async waitForDispatch(runId: string, toolCallId: string, state: ClientToolDispatchState) {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const turn = await repositories.findAssistantTurnByRun({
          workspaceId: toWorkspaceId(TEST_WORKSPACE_ID),
          subjectId: toSubjectId(TEST_SUBJECT_ID),
          runId,
        });
        if (turn !== undefined) {
          const dispatch = await repositories.findClientToolDispatch({
            workspaceId: toWorkspaceId(TEST_WORKSPACE_ID),
            assistantTurnId: turn.assistantTurnId,
            toolCallId: toToolCallId(toolCallId),
          });
          if (dispatch?.state === state) return dispatch;
        }
        await delay(50);
      }
      throw new Error(`Client-tool dispatch did not reach ${state}`);
    },
    async waitForWorkflowHook(token: string): Promise<void> {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const result = await observationPool.query(
          `select 1 from workflow.workflow_hooks where token = $1 limit 1`,
          [token],
        );
        if ((result.rowCount ?? 0) > 0) return;
        await delay(50);
      }
      throw new Error("Workflow hook was not durably registered");
    },
    async countDispatchRows(assistantTurnId: string, toolCallId: string): Promise<number> {
      const result = await observationPool.query<{ count: string }>(
        `select count(*)::text as count
             from sidechat.client_tool_dispatches
            where workspace_id = $1 and assistant_turn_id = $2 and tool_call_id = $3`,
        [TEST_WORKSPACE_ID, assistantTurnId, toolCallId],
      );
      return Number(result.rows[0]?.count ?? "0");
    },
    async waitForWorkflowRunTerminal(runId: string): Promise<string> {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const result = await observationPool.query<{ status: string }>(
          `select status::text as status
             from workflow.workflow_runs
            where id = $1`,
          [runId],
        );
        const status = result.rows[0]?.status;
        if (status === "completed" || status === "failed" || status === "cancelled") {
          return status;
        }
        await delay(50);
      }
      throw new Error("Workflow run did not reach a terminal status");
    },
    describeWorkflowRun: describeWorkflowRun.bind(undefined, observationPool),
    async close(): Promise<void> {
      await Promise.all([repositories.close(), observationPool.end()]);
    },
  };
}

async function describeWorkflowRun(
  observationPool: Pool,
  runId: string,
): Promise<WorkflowRunDescription> {
  const [run, hooks, steps, streams] = await Promise.all([
    observationPool.query<{ status: string }>(
      `select status::text as status
         from workflow.workflow_runs
        where id = $1`,
      [runId],
    ),
    observationPool.query<{ is_system: boolean; token: string }>(
      `select is_system, token
         from workflow.workflow_hooks
        where run_id = $1
        order by created_at`,
      [runId],
    ),
    observationPool.query<{ status: string; step_name: string }>(
      `select status::text as status, step_name
         from workflow.workflow_steps
        where run_id = $1
        order by created_at`,
      [runId],
    ),
    observationPool.query<{ bytes: number; stream_id: string }>(
      `select sum(octet_length(data))::int as bytes, stream_id
         from workflow.workflow_stream_chunks
        where run_id = $1
        group by stream_id
        order by stream_id`,
      [runId],
    ),
  ]);
  return {
    status: run.rows[0]?.status,
    hooks: hooks.rows.map(({ is_system: isSystem, token }) => ({ isSystem, token })),
    steps: steps.rows.map(({ status, step_name: name }) => ({ name, status })),
    streams: streams.rows.map(({ bytes, stream_id: name }) => ({ bytes, name })),
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
