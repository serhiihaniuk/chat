import { getWorld, setWorld } from "workflow/runtime";

export type StartedWorkflowWorld = Readonly<{
  close: () => Promise<void>;
}>;

/** Acquire the configured Workflow world before the listener opens and own its worker/pool. */
export async function startWorkflowWorld(): Promise<StartedWorkflowWorld> {
  const world = await getWorld();
  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closePromise ??= closeWorld();
    return closePromise;
  };
  const closeWorld = async (): Promise<void> => {
    try {
      await world.close?.();
    } finally {
      setWorld(undefined);
    }
  };

  try {
    // Nitro bundles world-local, whose package-version probe currently returns
    // the non-semver sentinel "bundled" when start() initializes its data dir.
    // Persistent lifecycle verification uses Postgres; local fake mode keeps
    // the SDK's existing lazy-start behavior until that upstream bug is fixed.
    if (!("clear" in world)) await world.start?.();
    return { close };
  } catch (startError) {
    let closeFailure: unknown;

    try {
      await close();
    } catch (error) {
      closeFailure = error;
    }

    if (closeFailure !== undefined) {
      const startupFailure = new Error("Workflow world startup failed", {
        cause: startError,
      });
      Object.assign(startupFailure, { closeFailure });
      throw startupFailure;
    }

    throw startError;
  }
}
