import { Effect } from "effect";
import {
  validateStreamEvent,
  type SidechatStreamEvent,
} from "@side-chat/shared-protocol";

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
