import type { UIMessageChunk } from "ai";

export const TURN_REPLAY_RESULTS = {
  FOUND: "found",
  NOT_FOUND: "not_found",
  START_INDEX_OUT_OF_RANGE: "start_index_out_of_range",
} as const;

export type TurnReplayResult =
  | Readonly<{
      status: typeof TURN_REPLAY_RESULTS.FOUND;
      stream: ReadableStream<UIMessageChunk>;
      tailIndex: number;
    }>
  | Readonly<{ status: typeof TURN_REPLAY_RESULTS.NOT_FOUND }>
  | Readonly<{
      status: typeof TURN_REPLAY_RESULTS.START_INDEX_OUT_OF_RANGE;
      tailIndex: number;
    }>;

/** Opens a fresh durable stream reader for each replay subscriber. */
export interface TurnReplay {
  open(runId: string, startIndex: number): Promise<TurnReplayResult>;
}
