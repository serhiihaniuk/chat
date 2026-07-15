import { getWorld } from "workflow/runtime";

const WORKFLOW_ABORT_STREAM = {
  HOOK_PREFIX: "abrt_",
  LIST_LIMIT: 100,
  STREAM_PREFIX: "strm_",
  STREAM_SUFFIX: "_system_abort",
  WAKE_PACKET: Uint8Array.of(0),
} as const;

type WorkflowAbortHook = Readonly<{
  isSystem?: boolean | undefined;
  token: string;
}>;

type ChatTurnAbortStreamDependencies = Readonly<{
  listHooks: (runId: string) => Promise<readonly WorkflowAbortHook[]>;
  writeStream: (runId: string, streamName: string, chunk: Uint8Array) => Promise<void>;
}>;

/**
 * Wake the host-native AbortSignal already listening inside the provider step.
 *
 * Postgres serializes the workflow continuation behind that active step, so the
 * durable user hook alone cannot interrupt it. Workflow's step reviver treats
 * any unreadable abort packet as an abort without a reason; the durable hook
 * remains the reason and terminal authority when replay resumes.
 */
export async function wakeChatTurnProviderStep(
  runId: string,
  dependencies: ChatTurnAbortStreamDependencies = defaultDependencies(),
): Promise<boolean> {
  const hooks = await dependencies.listHooks(runId);
  const streamNames = hooks
    .filter((hook) => hook.isSystem)
    .map((hook) => abortStreamName(hook.token))
    .filter((streamName): streamName is string => streamName !== undefined);
  for (const streamName of streamNames) {
    await dependencies.writeStream(runId, streamName, WORKFLOW_ABORT_STREAM.WAKE_PACKET);
  }
  return streamNames.length > 0;
}

function abortStreamName(hookToken: string): string | undefined {
  if (!hookToken.startsWith(WORKFLOW_ABORT_STREAM.HOOK_PREFIX)) return undefined;
  const id = hookToken.slice(WORKFLOW_ABORT_STREAM.HOOK_PREFIX.length);
  if (!id) return undefined;
  return `${WORKFLOW_ABORT_STREAM.STREAM_PREFIX}${id}${WORKFLOW_ABORT_STREAM.STREAM_SUFFIX}`;
}

function defaultDependencies(): ChatTurnAbortStreamDependencies {
  return {
    listHooks: async (runId) => {
      const world = await getWorld();
      const hooks = await world.hooks.list({
        runId,
        pagination: { limit: WORKFLOW_ABORT_STREAM.LIST_LIMIT },
      });
      return hooks.data;
    },
    writeStream: async (runId, streamName, chunk) => {
      const world = await getWorld();
      await world.streams.write(runId, streamName, chunk);
    },
  };
}
