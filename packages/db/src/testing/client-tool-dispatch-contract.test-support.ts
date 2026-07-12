import { describe, expect, it } from "vitest";

import type { SidechatRepositories } from "#repositories/contract";
import { DB_REPOSITORY_ERROR_CODES } from "#repositories/errors";
import { closeIfNeeded, now, startTurn, workspaceId } from "./repository-contract.helpers.js";

type RepositoryFactory = () => SidechatRepositories;

/** Adapter-neutral replay and bind-once contract used by the real Postgres suite. */
export const clientToolDispatchRepositoryContract = (
  label: string,
  createRepositories: RepositoryFactory,
): void => {
  let scopeIndex = 0;
  const nextScope = () => `${label.replaceAll(/\W+/gu, "_")}_client_${++scopeIndex}`;

  describe("client tool dispatch repository", () => {
    it("creates one dispatch row for a replayed tool call", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);
        const command = {
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          toolCallId: "client_tool_1",
          toolName: "open_resource",
          now,
        } as const;

        const created = await repositories.createClientToolDispatch(command);
        const replayed = await repositories.createClientToolDispatch(command);

        expect(created.record.state).toBe("dispatched");
        expect(replayed).toEqual({ record: created.record, inserted: false });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("allows an idempotent run bind but rejects rebinding", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);
        const runId = `${scope}_run_1`;
        const command = {
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          runId,
          now,
        } as const;

        await expect(repositories.bindTurnRun(command)).resolves.toMatchObject({
          runId,
        });
        await expect(repositories.bindTurnRun(command)).resolves.toMatchObject({
          runId,
        });
        await expect(
          repositories.bindTurnRun({ ...command, runId: `${scope}_run_other` }),
        ).rejects.toMatchObject({ code: DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION });
      } finally {
        await closeIfNeeded(repositories);
      }
    });
  });
};
