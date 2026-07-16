import { toAssistantTurnId, toToolCallId, toWorkspaceId } from "@side-chat/db";
import type { JsonValue } from "@side-chat/shared";

import {
  CLIENT_TOOL_DISPATCH_LOOKUP,
  type ClientToolDispatchStore,
  type ClientToolDispatchSnapshot,
  type ClientToolOutputEnvelope,
  type ClientToolWorkflowStore,
} from "#application/ports/turn/tools/client-tool-dispatch-store";

import type { ClosableRepositories } from "./types.js";

/** Map authenticated run ownership and atomic result settlement onto PostgreSQL. */
export function createPostgresClientToolDispatchStore(
  repositories: ClosableRepositories,
): ClientToolDispatchStore & ClientToolWorkflowStore {
  return {
    async create(dispatch) {
      const result = await repositories.createClientToolDispatch({
        ...toRepositoryIdentity(dispatch),
        clientToolCapabilityDigest: dispatch.clientToolCapabilityDigest,
        toolName: dispatch.toolName,
        now: new Date().toISOString(),
      });
      return toSnapshot(result.record);
    },

    async read(dispatch) {
      const record = await repositories.findClientToolDispatch(toRepositoryIdentity(dispatch));
      return record === undefined ? undefined : toSnapshot(record);
    },

    async claimTimeout(dispatch, output) {
      const result = await repositories.claimClientToolTimeout({
        ...toRepositoryIdentity(dispatch),
        outputJson: output,
        now: new Date().toISOString(),
      });
      return result === undefined ? undefined : toSnapshot(result.record);
    },

    async claimAbort(dispatch, output) {
      const result = await repositories.claimClientToolAbort({
        ...toRepositoryIdentity(dispatch),
        outputJson: output,
        now: new Date().toISOString(),
      });
      return result === undefined ? undefined : toSnapshot(result.record);
    },

    async findOwned(auth, runId, toolCallId, clientToolCapabilityDigest) {
      const turn = await repositories.findAssistantTurnByRun({
        workspaceId: toWorkspaceId(auth.workspaceId),
        subjectId: auth.subjectId,
        runId,
      });
      if (turn === undefined) return CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND;
      const dispatch = await repositories.findClientToolDispatch({
        workspaceId: turn.workspaceId,
        assistantTurnId: turn.assistantTurnId,
        toolCallId: toToolCallId(toolCallId),
      });
      if (
        dispatch === undefined ||
        dispatch.clientToolCapabilityDigest !== clientToolCapabilityDigest
      ) {
        return CLIENT_TOOL_DISPATCH_LOOKUP.NOT_FOUND;
      }
      return {
        workspaceId: auth.workspaceId,
        turnId: turn.assistantTurnId,
        runId,
        toolCallId,
      };
    },

    async submit(dispatch, state, output) {
      const result = await repositories.submitClientToolOutput({
        workspaceId: toWorkspaceId(dispatch.workspaceId),
        assistantTurnId: toAssistantTurnId(dispatch.turnId),
        toolCallId: toToolCallId(dispatch.toolCallId),
        state,
        outputJson: output,
        now: new Date().toISOString(),
      });
      if (result === undefined) throw new Error("Client-tool dispatch disappeared during settle");
      return {
        disposition: result.disposition,
        state: result.record.state,
        output: requireOutputEnvelope(result.record.outputJson),
      };
    },
  };
}

function toRepositoryIdentity(dispatch: {
  readonly workspaceId: string;
  readonly turnId: string;
  readonly toolCallId: string;
}) {
  return {
    workspaceId: toWorkspaceId(dispatch.workspaceId),
    assistantTurnId: toAssistantTurnId(dispatch.turnId),
    toolCallId: toToolCallId(dispatch.toolCallId),
  };
}

function toSnapshot(record: {
  readonly state: ClientToolDispatchSnapshot["state"];
  readonly outputJson?: Readonly<Record<string, JsonValue>> | undefined;
}): ClientToolDispatchSnapshot {
  return {
    state: record.state,
    ...(record.outputJson === undefined
      ? {}
      : { output: requireOutputEnvelope(record.outputJson) }),
  };
}

function requireOutputEnvelope(value: Readonly<Record<string, JsonValue>> | undefined) {
  if (value === undefined || !("value" in value)) {
    throw new Error("Settled client-tool dispatch has no model output");
  }
  return { ...value, value: value["value"] } satisfies ClientToolOutputEnvelope;
}
