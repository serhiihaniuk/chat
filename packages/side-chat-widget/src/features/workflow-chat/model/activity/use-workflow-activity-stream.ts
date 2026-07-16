import { useEffect, useRef, useState } from "react";

import {
  isRunningActivity,
  TURN_ACTIVITY_SYNC_EVENT_TYPE,
  type TurnActivityEvent,
  type TurnActivityStreamEvent,
  type TurnActivitySyncEvent,
} from "#entities/workflow-chat";

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 30_000;

type SubscribeActivity = (options?: {
  readonly signal?: AbortSignal | undefined;
}) => Promise<Readonly<{ events: AsyncIterable<TurnActivityStreamEvent> }>>;

export type WorkflowActivityStreamState = Readonly<{
  runningConversationIds: ReadonlySet<string>;
  synchronized: boolean;
}>;

type WorkflowActivityStreamInput = Readonly<{
  subscribe: SubscribeActivity;
  onSynchronized?: ((event: TurnActivitySyncEvent) => void) | undefined;
  onVisibilityReconcile?: (() => void) | undefined;
  onEvent?: ((event: TurnActivityEvent) => void) | undefined;
}>;

/** Maintain the subject activity stream and replace uncertain state with each snapshot. */
export function useWorkflowActivityStream(
  input: WorkflowActivityStreamInput,
): WorkflowActivityStreamState {
  const [state, setState] = useState<WorkflowActivityStreamState>(initialActivityState);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    const loop = startActivityLoop(
      () => inputRef.current.subscribe,
      setState,
      (event) => inputRef.current.onSynchronized?.(event),
      (event) => inputRef.current.onEvent?.(event),
    );
    const onVisible = (): void => {
      if (document.visibilityState === "visible") inputRef.current.onVisibilityReconcile?.();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", loop.reconnect);
    return () => {
      loop.stop();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", loop.reconnect);
    };
  }, []);

  return state;
}

type ActivityLoop = Readonly<{ stop: () => void; reconnect: () => void }>;
type SetActivityState = (
  updater: (current: WorkflowActivityStreamState) => WorkflowActivityStreamState,
) => void;

function startActivityLoop(
  getSubscribe: () => SubscribeActivity,
  setState: SetActivityState,
  onSynchronized: (event: TurnActivitySyncEvent) => void,
  onEvent: (event: TurnActivityEvent) => void,
): ActivityLoop {
  let active = true;
  let controller: AbortController | undefined;

  const consumeOnce = async (onConnect: () => void): Promise<void> => {
    controller = new AbortController();
    const { events } = await getSubscribe()({ signal: controller.signal });
    if (!active) return;
    onConnect();
    setState(markUnsynchronized);
    for await (const event of events) {
      if (!active) return;
      if (event.type === TURN_ACTIVITY_SYNC_EVENT_TYPE) {
        setState(() => synchronizedState(event));
        onSynchronized(event);
      } else {
        setState((current) => ({
          ...current,
          runningConversationIds: applyActivity(current.runningConversationIds, event),
        }));
        onEvent(event);
      }
    }
  };

  const loop = async (): Promise<void> => {
    let attempt = 0;
    while (active) {
      try {
        await consumeOnce(() => {
          attempt = 0;
        });
      } catch {
        if (!active) return;
      }
      if (!active) return;
      await delay(backoffDelayMs(attempt));
      attempt += 1;
    }
  };
  void loop();

  return {
    stop: () => {
      active = false;
      controller?.abort();
    },
    reconnect: () => controller?.abort(),
  };
}

const initialActivityState = (): WorkflowActivityStreamState => ({
  runningConversationIds: new Set<string>(),
  synchronized: false,
});

const markUnsynchronized = (
  current: WorkflowActivityStreamState,
): WorkflowActivityStreamState =>
  current.synchronized ? { ...current, synchronized: false } : current;

const synchronizedState = (event: TurnActivitySyncEvent): WorkflowActivityStreamState => ({
  runningConversationIds: new Set(event.activeTurns.map((turn) => turn.conversationId)),
  synchronized: true,
});

function applyActivity(
  current: ReadonlySet<string>,
  event: TurnActivityEvent,
): ReadonlySet<string> {
  const running = isRunningActivity(event);
  if (running === current.has(event.conversationId)) return current;
  const next = new Set(current);
  if (running) next.add(event.conversationId);
  else next.delete(event.conversationId);
  return next;
}

const backoffDelayMs = (attempt: number): number =>
  Math.random() * Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
