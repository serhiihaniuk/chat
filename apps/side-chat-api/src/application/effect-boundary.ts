import { Effect } from "effect";

/**
 * Small bridge for places where Effect workflows leave the application layer
 * and need to behave like ordinary async code for framework adapters.
 */
export const runEffectBoundary = <Success, Error>(
  program: Effect.Effect<Success, Error, never>,
): Promise<Success> => Effect.runPromise(program);
