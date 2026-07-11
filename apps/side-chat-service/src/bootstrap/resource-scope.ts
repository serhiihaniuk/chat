import type { Settings } from "#application/configuration/resolve-settings";

/** One infrastructure part owned by the service process after successful startup. */
export type StartedServicePart = {
  readonly name: string;
  readonly close: () => void | Promise<void>;
};

/** Start one infrastructure part. Step 04 supplies the concrete production starters. */
export type StartServicePart = (
  settings: Settings,
) => StartedServicePart | Promise<StartedServicePart>;

export type StartedServiceScope = {
  readonly settings: Settings;
  readonly isReady: () => boolean;
  readonly close: () => Promise<void>;
};

/** Start in declaration order; on failure or shutdown, close completed parts in reverse order. */
export async function startServiceScope(
  settings: Settings,
  starters: readonly StartServicePart[],
): Promise<StartedServiceScope> {
  const startedParts: StartedServicePart[] = [];
  try {
    for (const start of starters) startedParts.push(await start(settings));
  } catch (error) {
    await closeStartedParts(startedParts);
    throw error;
  }

  let ready = true;
  return {
    settings,
    isReady: () => ready,
    close: async () => {
      if (!ready) return;
      ready = false;
      await closeStartedParts(startedParts);
    },
  };
}

async function closeStartedParts(startedParts: readonly StartedServicePart[]): Promise<void> {
  const failures: unknown[] = [];
  for (const part of [...startedParts].reverse()) {
    try {
      await part.close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, "Service resource disposal failed");
}
