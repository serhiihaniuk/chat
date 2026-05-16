import { Effect } from "effect";
import { validateRequest } from "@side-chat/shared-protocol";
import type { SidechatRequest } from "@side-chat/shared-protocol";

import { InvalidRequest } from "./errors.js";

export const decodeSidechatRequestEffect = (
  body: unknown,
): Effect.Effect<SidechatRequest, InvalidRequest, never> => {
  const parsed = validateRequest(body);
  return parsed.ok
    ? Effect.succeed(parsed.data)
    : Effect.fail(new InvalidRequest());
};
