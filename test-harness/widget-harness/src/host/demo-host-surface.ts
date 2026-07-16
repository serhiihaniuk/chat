import type { JsonObject } from "@side-chat/shared";

/**
 * In-memory state for the harness "demo host app".
 *
 * The harness page itself is the host application: it owns a small list of
 * records and a log of the client tools the assistant called. A client tool
 * never mutates the widget; it asks the host to change this state.
 */
export type DemoHostRecordOrigin = "seed" | "manual" | "assistant";

export type DemoHostRecord = {
  readonly id: string;
  readonly label: string;
  readonly origin: DemoHostRecordOrigin;
};

export type DemoHostToolLogEntry = {
  readonly id: string;
  readonly toolName: string;
  readonly status: string;
  readonly resultCode: string;
};

export type DemoHostState = {
  readonly records: readonly DemoHostRecord[];
  readonly activeRecordId: string | null;
  readonly assistantActionCount: number;
  readonly log: readonly DemoHostToolLogEntry[];
};

/** Minimal tool-call view the host reads when applying a client tool. */
export type DemoHostToolCall = {
  readonly toolName: string;
  readonly input: JsonObject;
};

/** Minimal result view the host records once a tool call resolves. */
export type DemoHostToolResult = {
  readonly status: string;
  readonly resultCode: string;
};

/**
 * External store consumed by `useSyncExternalStore` (in the panel) and mutated
 * by the host bridge (outside React). Snapshots are referentially stable until a
 * mutation occurs, so the same instance is safe for server and client renders.
 */
export type DemoHostSurface = {
  readonly getSnapshot: () => DemoHostState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly applyToolCall: (toolCall: DemoHostToolCall, result: DemoHostToolResult) => void;
  readonly addManualRecord: () => void;
  readonly reset: () => void;
};

const OPEN_RESOURCE_TOOL = "open_resource";
const MAX_LOG_ENTRIES = 8;

const SEED_RECORDS: readonly DemoHostRecord[] = [
  { id: "ticket-4821", label: "Support ticket #4821", origin: "seed" },
  { id: "invoice-1042", label: "Invoice #1042", origin: "seed" },
  { id: "customer-acme", label: "Customer · Acme Corp", origin: "seed" },
];

const createInitialState = (): DemoHostState => ({
  records: SEED_RECORDS,
  activeRecordId: null,
  assistantActionCount: 0,
  log: [],
});

const readString = (payload: JsonObject, key: string): string | undefined => {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
};

const withOpenedRecord = (state: DemoHostState, id: string, label: string): DemoHostState => {
  const exists = state.records.some((record) => record.id === id);
  const opened: DemoHostRecord = { id, label, origin: "assistant" };
  return {
    ...state,
    records: exists ? state.records : [...state.records, opened],
    activeRecordId: id,
    assistantActionCount: state.assistantActionCount + 1,
  };
};

const withLoggedTool = (
  state: DemoHostState,
  entry: DemoHostToolLogEntry,
): DemoHostState => ({
  ...state,
  log: [entry, ...state.log].slice(0, MAX_LOG_ENTRIES),
});

const withManualRecord = (state: DemoHostState, id: string, ordinal: number): DemoHostState => ({
  ...state,
  records: [...state.records, { id, label: `Manual record ${ordinal}`, origin: "manual" }],
  activeRecordId: id,
});

const applyToolCallToState = (
  state: DemoHostState,
  toolCall: DemoHostToolCall,
  result: DemoHostToolResult,
  logId: string,
): DemoHostState => {
  const logged = withLoggedTool(state, {
    id: logId,
    toolName: toolCall.toolName,
    status: result.status,
    resultCode: result.resultCode,
  });
  const resourceId = readString(toolCall.input, "resourceId");
  if (toolCall.toolName === OPEN_RESOURCE_TOOL && result.status === "applied" && resourceId) {
    return withOpenedRecord(logged, resourceId, resourceId);
  }
  return logged;
};

export const createDemoHostSurface = (): DemoHostSurface => {
  let state = createInitialState();
  let manualCount = 0;
  let logCount = 0;
  const listeners = new Set<() => void>();

  const commit = (next: DemoHostState): void => {
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    applyToolCall: (toolCall, result) => {
      logCount += 1;
      commit(applyToolCallToState(state, toolCall, result, `log-${logCount}`));
    },
    addManualRecord: () => {
      manualCount += 1;
      commit(withManualRecord(state, `manual-${manualCount}`, manualCount));
    },
    reset: () => {
      manualCount = 0;
      logCount = 0;
      commit(createInitialState());
    },
  };
};
