import type { DiagnosticLogger } from "@side-chat/shared";

import { TURN_ACTIVITY_NOTIFY_CHANNEL } from "#schema-contract";
import {
  parseTurnActivityNotification,
  type TurnActivityNotification,
  type TurnActivityNotificationSource,
} from "../../notifications/turn-activity-notifications.js";
import { reconnectingListenStream } from "./reconnecting-listen-source.js";

/** One self-healing LISTEN connection per service process, scoped by its consumer. */
export const createPostgresTurnActivityNotificationSource = (
  connectionString: string,
  logger?: DiagnosticLogger,
): TurnActivityNotificationSource => ({
  notifications: reconnectingListenStream<TurnActivityNotification>({
    connectionString,
    channel: TURN_ACTIVITY_NOTIFY_CHANNEL,
    parse: parseTurnActivityNotification,
    logger,
  }),
});
