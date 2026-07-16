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
    async measureLifecycleRows(): Promise<
      Readonly<{
        assistantTurns: number;
        contextSnapshots: number;
        messages: number;
      }>
    > {
      const result = await observationPool.query<{
        assistant_turns: number;
        context_snapshots: number;
        messages: number;
      }>(`select
        (select count(*)::int from sidechat.assistant_turns) as assistant_turns,
        (select count(*)::int from sidechat.turn_context_snapshots) as context_snapshots,
        (select count(*)::int from sidechat.messages) as messages`);
      const counts = result.rows[0];
      if (counts === undefined) throw new Error("Lifecycle row measurement returned no row");
      return {
        assistantTurns: counts.assistant_turns,
        contextSnapshots: counts.context_snapshots,
        messages: counts.messages,
      };
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
    async close(): Promise<void> {
      await Promise.all([repositories.close(), observationPool.end()]);
    },
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
