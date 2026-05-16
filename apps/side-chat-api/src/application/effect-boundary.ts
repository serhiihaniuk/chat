import { Effect } from "effect";

export const runEffectBoundary = <Success, Error>(
  program: Effect.Effect<Success, Error, never>,
): Promise<Success> => Effect.runPromise(program);
