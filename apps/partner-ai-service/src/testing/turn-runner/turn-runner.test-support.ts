import type { TurnRunner, TurnRunnerTestHandle } from "#inbound/turn-runner/turn-runner";

/** Prove that a composed production runner retained its test-only await handle. */
export const isTurnRunnerTestHandle = (runner: TurnRunner): runner is TurnRunnerTestHandle =>
  "awaitTurn" in runner && typeof runner.awaitTurn === "function";
