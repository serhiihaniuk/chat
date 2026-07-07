import {
  TURN_ACTIVITY_HISTORY_MODES,
  type TurnActivityHistoryMode,
} from "@side-chat/partner-ai-core";

import { readStringEnvReference } from "../environment.js";
import { ServiceConfigError } from "../../service-config-error.js";
import type { ServiceEnv, SideChatConfig } from "../types.js";

/**
 * Resolve the turn-activity retention posture from `history.turnActivity`.
 *
 * Fails loudly on a value outside the closed union so a typo'd deployment can
 * never silently start (or silently stop) storing thinking traces.
 */
export const readTurnActivityHistory = (
  config: SideChatConfig,
  env: ServiceEnv,
): TurnActivityHistoryMode => {
  const value =
    readStringEnvReference(env, config.history.turnActivity) ?? TURN_ACTIVITY_HISTORY_MODES.FULL;
  if (
    value === TURN_ACTIVITY_HISTORY_MODES.FULL ||
    value === TURN_ACTIVITY_HISTORY_MODES.DISABLED
  ) {
    return value;
  }
  throw new ServiceConfigError(
    `${config.history.turnActivity.key} must be "full" or "disabled", received "${value}".`,
  );
};
