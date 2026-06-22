import {
  prepareStreamChatTurn,
  runTurnGeneration,
  type AuthContext,
  type PreparedStreamChatTurn,
  type StreamChatInput,
  type StreamChatPorts,
  type TurnLeaseSettings,
  type WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import { Effect, Exit, type Fiber, FiberMap, Option, Scope } from "effect";

/**
 * Inputs the HTTP edge hands the runner to start one server-owned turn.
 *
 * The runner already holds the workspace and host-app identity from composition;
 * a request only carries the parsed `sidechat.v1` request, the proven auth
 * context, and an optional trace id. There is deliberately no abort signal here:
 * generation must not be tied to the browser connection.
 */
export type StartTurnInput = {
  readonly request: ChatStreamRequest;
  readonly authContext: AuthContext;
  readonly traceId?: string | undefined;
};

/**
 * Identity returned to the caller the moment a turn is accepted.
 *
 * `assistantTurnId` is the canonical key for events, status, stream, and cancel;
 * `requestId` stays the idempotency/resolver key. `status` is always `running`
 * here because generation has been accepted and forked, never awaited.
 */
export type StartedTurn = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly conversationId: string;
  readonly status: "running";
};

/**
 * Owns server-side assistant-turn generation, decoupled from the HTTP request.
 *
 * `start` runs the pre-start pipeline synchronously (so setup failures stay
 * request-level JSON errors) and then forks post-start generation into a
 * service-scoped `FiberMap` keyed by `assistantTurnId`. The forked fiber lives in
 * the runner's own scope, so it runs to a durable terminal regardless of the
 * browser connection and is interrupted on shutdown.
 */
export type TurnRunner = {
  readonly start: (input: StartTurnInput) => Promise<StartedTurn>;
  /** Await one turn's generation fiber; resolves immediately if it is not running. */
  readonly awaitTurn: (assistantTurnId: string) => Promise<void>;
  /** Interrupt one turn's generation fiber, triggering its abnormal finalize. */
  readonly interruptTurn: (assistantTurnId: string) => Promise<void>;
  /** Interrupt every in-flight turn and close the runner scope (shutdown). */
  readonly shutdown: () => Promise<void>;
};

export type TurnRunnerDependencies = {
  readonly workspace: WorkspaceRef;
  readonly hostAppId: string;
  readonly ports: StreamChatPorts;
  /** Owner-lease tunables; the forked generation heartbeats and fences on these. */
  readonly lease: TurnLeaseSettings;
};

/**
 * Build a runner backed by a long-lived scope and a per-instance `FiberMap`.
 *
 * The scope and map are created eagerly here because the runner outlives any one
 * request: every forked generation is registered in the map and interrupted when
 * the scope closes. Keys are server-generated `assistantTurnId`s, which are
 * globally unique, so the map is tenant-safe.
 */
export const createTurnRunner = (dependencies: TurnRunnerDependencies): TurnRunner => {
  const scope = Effect.runSync(Scope.make());
  const fibers = Effect.runSync(
    FiberMap.make<string>().pipe(Effect.provideService(Scope.Scope, scope)),
  );

  const start = async (input: StartTurnInput): Promise<StartedTurn> => {
    // Pre-start runs synchronously; its failures reject setup as JSON, matching
    // the documented assistant-turn failure split.
    const turn = await Effect.runPromise(
      prepareStreamChatTurn(dependencies.ports, streamInput(dependencies, input)),
    );

    // Idempotency: a repeated requestId returns the existing turn without forking
    // a second generation. startAssistantTurn already conflicts on
    // (workspace_id, request_id), so a replay resolves to the same turn record.
    if (turn.assistantTurn.inserted) {
      forkGeneration(dependencies, fibers, input, turn);
    }

    return startedTurn(turn);
  };

  const awaitTurn = (assistantTurnId: string): Promise<void> =>
    Effect.runPromise(FiberMap.get(fibers, assistantTurnId)).then((fiber) =>
      Option.isSome(fiber) ? awaitFiberSettled(fiber.value) : undefined,
    );

  const interruptTurn = (assistantTurnId: string): Promise<void> =>
    Effect.runPromise(FiberMap.remove(fibers, assistantTurnId));

  const shutdown = (): Promise<void> =>
    Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)));

  return { start, awaitTurn, interruptTurn, shutdown };
};

/**
 * Fork post-start generation into the service scope, under an owner lease.
 *
 * `FiberMap.run` forks with the runner's captured runtime and registers the
 * fiber under the turn id, so the generation survives the request that started
 * it. `runTurnGeneration` claims and heartbeats the lease internally (and
 * self-interrupts if fenced) under the same `onExit` that finalizes the turn. We
 * do not await the fiber: `start` returns as soon as generation is accepted.
 */
const forkGeneration = (
  dependencies: TurnRunnerDependencies,
  fibers: FiberMap.FiberMap<string>,
  input: StartTurnInput,
  turn: PreparedStreamChatTurn,
): void => {
  Effect.runSync(
    FiberMap.run(
      fibers,
      turn.assistantTurnId,
      runTurnGeneration(
        dependencies.ports,
        streamInput(dependencies, input),
        turn,
        dependencies.lease,
      ),
    ),
  );
};

/**
 * Build the core input for generation without the HTTP abort signal.
 *
 * Tying generation to `context.req.raw.signal` is exactly the request-coupling
 * this runner removes, so the signal is intentionally never threaded through.
 */
const streamInput = (
  dependencies: TurnRunnerDependencies,
  input: StartTurnInput,
): StreamChatInput => ({
  workspace: dependencies.workspace,
  hostAppId: dependencies.hostAppId,
  request: input.request,
  authContext: input.authContext,
  traceId: input.traceId,
});

const startedTurn = (turn: PreparedStreamChatTurn): StartedTurn => ({
  requestId: turn.correlation.requestId,
  assistantTurnId: turn.assistantTurnId,
  conversationId: turn.conversation.conversationId,
  status: "running",
});

/**
 * Resolve once a generation fiber has settled, ignoring its outcome.
 *
 * The durable outcome is already persisted by the fiber's `onExit` finalizer, so
 * a failed or interrupted generation is an expected settled state here, not an
 * error to propagate to the awaiting caller.
 */
const awaitFiberSettled = (fiber: Fiber.Fiber<unknown, unknown>): Promise<void> =>
  new Promise((resolve) => {
    fiber.addObserver(() => resolve());
  });
