import { Effect } from "effect";
import {
  validateStreamEvent,
  type SidechatStreamEvent,
} from "@side-chat/shared-protocol";

/**
 * Application boundary: raw SSE frame text enters as unknown JSON and leaves as
 * a validated sidechat.v1 event. UI code should not decode provider shapes.
 */
export const decodeKnownFramePayload = (
  data: string,
): Effect.Effect<SidechatStreamEvent | undefined, never> =>
  Effect.sync(() => {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return undefined;
    }

    const parsed = validateStreamEvent(json);
    return parsed.ok ? parsed.data : undefined;
  });
