import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { toMessageId } from "#schema-contract";
import {
  createPostgresDrizzleSidechatRepositories,
  type PostgresDrizzleSidechatRepositories,
  uniqueViolationConstraint,
} from "./index.js";
import { conversationListRepositoryContract } from "#testing/conversation-list-contract.test-support";
import { clientToolDispatchRepositoryContract } from "#testing/client-tool-dispatch-contract.test-support";
import { sidechatRepositoryContract } from "#testing/repository-contract.test-support";
import { startTurn, workspaceId } from "#testing/repository-contract.helpers";
import { turnResolutionRepositoryContract } from "#testing/turn/turn-resolution-contract.test-support";

const databaseUrl = requireDatabaseUrl();

describe("postgres drizzle repositories", () => {
  sidechatRepositoryContract("shared repository contract", () =>
    createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    }),
  );
  conversationListRepositoryContract("postgres drizzle repositories", () =>
    createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    }),
  );
  clientToolDispatchRepositoryContract("postgres drizzle repositories", () =>
    createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    }),
  );
  turnResolutionRepositoryContract("postgres drizzle repositories", () =>
    createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    }),
  );

  it("keeps the real adapter closeable for externally provisioned DBs", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    await expect(repositories.close()).resolves.toBeUndefined();
  });

  it("gives concurrent appends to one conversation distinct sequence indexes", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const scope = {
      workspaceId: "workspace_concurrent",
      subjectId: "subject_concurrent",
    } as const;
    try {
      const conversation = await repositories.createOrGetConversation({
        ...scope,
        actorId: "actor_concurrent",
        conversationKey: "concurrent",
        now: NOW,
      });
      const append = (requestKey: string) =>
        repositories.appendMessage({
          ...scope,
          conversationId: conversation.record.conversationId,
          messageId: toMessageId(
            `${conversation.record.conversationId}:${requestKey}`,
          ),
          role: "user",
          parts: [{ type: "text", text: "hello" }],
          metadataJson: {},
          now: NOW,
        });

      // The conversation-row FOR UPDATE lock serializes the two racing appends, so
      // neither loses the sequence unique index to a duplicate-index conflict.
      const [first, second] = await Promise.all([
        append("request_a"),
        append("request_b"),
      ]);

      expect(first.inserted && second.inserted).toBe(true);
      expect(
        [first.record.sequenceIndex, second.record.sequenceIndex].sort(
          (a, b) => a - b,
        ),
      ).toEqual([0, 1]);
    } finally {
      await repositories.close();
    }
  });
  it("settles a duplicated client-tool result exactly once", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const scope = nextClientToolScope();
    try {
      const turn = await startTurn(repositories, scope);
      const identity = {
        workspaceId: workspaceId(scope),
        assistantTurnId: turn.assistantTurnId,
        toolCallId: "call_duplicate",
      } as const;
      await repositories.createClientToolDispatch({
        ...identity,
        toolName: "open_resource",
        now: NOW,
      });

      const outcomes = await Promise.all([
        repositories.submitClientToolOutput({
          ...identity,
          state: "settled",
          outputJson: { value: "first contender" },
          now: "2026-05-23T13:00:01.000Z",
        }),
        repositories.submitClientToolOutput({
          ...identity,
          state: "settled",
          outputJson: { value: "second contender" },
          now: "2026-05-23T13:00:02.000Z",
        }),
      ]);

      expect(
        outcomes.filter((outcome) => outcome?.disposition === "accepted"),
      ).toHaveLength(1);
      expect(
        outcomes.filter((outcome) => outcome?.disposition === "duplicate"),
      ).toHaveLength(1);
      expect(outcomes[0]?.record.outputJson).toEqual(
        outcomes[1]?.record.outputJson,
      );
      expect(outcomes[0]?.record.state).toBe("settled");
    } finally {
      await repositories.close();
    }
  });
  it("preserves one model outcome when result and timeout race", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const scope = nextClientToolScope();
    try {
      const turn = await startTurn(repositories, scope);
      const identity = {
        workspaceId: workspaceId(scope),
        assistantTurnId: turn.assistantTurnId,
        toolCallId: "call_timeout_race",
      } as const;
      await repositories.createClientToolDispatch({
        ...identity,
        toolName: "open_resource",
        now: NOW,
      });

      const [result, timeout] = await Promise.all([
        repositories.submitClientToolOutput({
          ...identity,
          state: "settled",
          outputJson: { value: "browser result" },
          now: "2026-05-23T13:00:01.000Z",
        }),
        repositories.claimClientToolTimeout({
          ...identity,
          outputJson: { status: "timed_out" },
          now: "2026-05-23T13:00:01.000Z",
        }),
      ]);

      expect(result).toBeDefined();
      expect(timeout).toBeDefined();
      expect([
        {
          disposition: "accepted",
          timeoutClaimed: false,
          state: "settled",
          outputJson: { value: "browser result" },
        },
        {
          disposition: "late",
          timeoutClaimed: true,
          state: "late",
          outputJson: { status: "timed_out" },
        },
      ]).toContainEqual({
        disposition: result?.disposition,
        timeoutClaimed: timeout?.claimed,
        state: result?.record.state,
        outputJson: result?.record.outputJson,
      });
    } finally {
      await repositories.close();
    }
  });
  it("marks a post-timeout result late without replacing the timeout output", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const scope = nextClientToolScope();
    try {
      const turn = await startTurn(repositories, scope);
      const identity = {
        workspaceId: workspaceId(scope),
        assistantTurnId: turn.assistantTurnId,
        toolCallId: "call_late",
      } as const;
      await repositories.createClientToolDispatch({
        ...identity,
        toolName: "open_resource",
        now: NOW,
      });
      await repositories.claimClientToolTimeout({
        ...identity,
        outputJson: { status: "timed_out" },
        now: "2026-05-23T13:00:01.000Z",
      });

      const late = await repositories.submitClientToolOutput({
        ...identity,
        state: "settled",
        outputJson: { value: "too late" },
        now: "2026-05-23T13:00:02.000Z",
      });

      expect(late).toMatchObject({
        disposition: "late",
        record: { state: "late", outputJson: { status: "timed_out" } },
      });
      expect(late?.record.lateResultAt).toBe("2026-05-23T13:00:02.000Z");
    } finally {
      await repositories.close();
    }
  });
  it("keeps one Workflow run bound to exactly one assistant turn", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    try {
      const first = await startTurn(repositories, nextClientToolScope());
      const secondScope = nextClientToolScope();
      const second = await startTurn(repositories, secondScope);
      await repositories.bindTurnRun({
        workspaceId: first.workspaceId,
        assistantTurnId: first.assistantTurnId,
        runId: "run_globally_unique",
        now: NOW,
      });

      const constraint = await repositories
        .bindTurnRun({
          workspaceId: workspaceId(secondScope),
          assistantTurnId: second.assistantTurnId,
          runId: "run_globally_unique",
          now: NOW,
        })
        .then(
          () => undefined,
          (error: unknown) => uniqueViolationConstraint(error),
        );
      expect(constraint).toBe("assistant_turns_run_uq");
    } finally {
      await repositories.close();
    }
  });
  it("plans the hot reads as index scans, never a seq scan of the full table", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    try {
      // Disable seq scans within the transaction so the planner must pick an index
      // if one covers the query; an uncovered query would still seq-scan (at a
      // punitive cost) and the index-name assertion would fail.
      // No index perfectly covers (workspace_id, subject_id, status = 'running'),
      // but the partial one-running-per-conversation unique index matches the
      // status predicate, so the tiny running working set is index-served instead
      // of a full sequential scan of every turn ever recorded.
      const activityPlan = await explainWithoutSeqScan(
        repositories,
        sql`select * from sidechat.assistant_turns
            where workspace_id = 'w' and subject_id = 's' and status = 'running'
            order by started_at desc`,
      );
      expect(activityPlan).not.toContain("Seq Scan");

      const usagePlan = await explainWithoutSeqScan(
        repositories,
        sql`select coalesce(sum(input_tokens), 0) from sidechat.usage_records
            where workspace_id = 'w'`,
      );
      expect(usagePlan).toContain("usage_records_workspace_idx");

      const listPlan = await explainWithoutSeqScan(
        repositories,
        sql`select * from sidechat.conversations
            where workspace_id = 'w' and subject_id = 's'
            order by last_message_at desc limit 25`,
      );
      expect(listPlan).toContain("conversations_workspace_subject_recent_idx");
    } finally {
      await repositories.close();
    }
  });
});

/** EXPLAIN a query with seq scans disabled, returning the joined plan text. */
const explainWithoutSeqScan = (
  repositories: PostgresDrizzleSidechatRepositories,
  query: ReturnType<typeof sql>,
): Promise<string> =>
  repositories.db.transaction(async (tx) => {
    await tx.execute(sql`set local enable_seqscan = off`);
    const result = await tx.execute(sql`explain ${query}`);
    return result.rows.map((row) => String(row["QUERY PLAN"])).join("\n");
  });

const NOW = "2026-05-23T13:00:00.000Z";
let clientToolScopeIndex = 0;

const nextClientToolScope = (): string => {
  clientToolScopeIndex += 1;
  return `client_tool_${clientToolScopeIndex}`;
};

function requireDatabaseUrl(): string {
  const value = process.env["SIDECHAT_TEST_DATABASE_URL"];
  if (!value) {
    throw new Error(
      "SIDECHAT_TEST_DATABASE_URL is required for test:db:integration.",
    );
  }
  return value;
}
