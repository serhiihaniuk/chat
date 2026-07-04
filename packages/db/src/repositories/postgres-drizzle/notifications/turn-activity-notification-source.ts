import type { DiagnosticLogger } from "@side-chat/shared";

import { TURN_ACTIVITY_NOTIFY_CHANNEL } from "#schema-contract";
import {
  parseTurnActivityNotification,
  type TurnActivityNotification,
  type TurnActivityNotificationSource,
} from "../../notifications/turn-activity-notifications.js";
import { reconnectingListenStream } from "./reconnecting-listen-source.js";

/**
 * Build the per-instance Postgres `LISTEN` source for turn-lifecycle signals.
 *
 * Mirrors the cancel source: one dedicated, self-healing connection (not from the
 * query pool, so it survives PgBouncer transaction pooling) `LISTEN`s on
 * `TURN_ACTIVITY_NOTIFY_CHANNEL` and surfaces parsed signals to the activity
 * dispatcher. No reconnect rescan is needed — a subscriber re-reads its snapshot
 * on its own reconnect, so a signal missed during an outage self-heals there.
 */
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
