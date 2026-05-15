import { Effect } from 'effect'

export const runEffectBoundary = <T>(run: () => Promise<T>): Promise<T> =>
  Effect.runPromise(Effect.tryPromise({ try: run, catch: (error) => error }))
