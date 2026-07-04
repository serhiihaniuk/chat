import type { DiagnosticLogger } from "@side-chat/shared";

import { TURN_CANCEL_NOTIFY_CHANNEL } from "#schema-contract";
import {
  parseTurnCancelNotification,
  type TurnCancelNotification,
  type TurnCancelNotificationSource,
} from "../../notifications/turn-cancel-notifications.js";
import { reconnectingListenStream } from "./reconnecting-listen-source.js";

/**
 * Build the per-instance Postgres `LISTEN` source for durable cancel intent.
 *
 * `requestTurnCancellation` `pg_notify`s `TURN_CANCEL_NOTIFY_CHANNEL` on commit;
 * this source holds one dedicated, self-healing connection (not from the query
 * pool, so it survives PgBouncer transaction pooling) and surfaces parsed signals
 * to the service cancel dispatcher.
 *
 * `rescan` re-reads running turns with durable cancel intent after every
 * (re)connect. `NOTIFY` is only a poke, so a cancel that fired while this listener
 * was disconnected would otherwise be lost until the reaper — the rescan re-feeds
 * each as a synthetic signal so the owning instance interrupts promptly.
 */
export const createPostgresTurnCancelNotificationSource = (
  connectionString: string,
  logger?: DiagnosticLogger,
  rescan?: () => Promise<readonly string[]>,
): TurnCancelNotificationSource => ({
  notifications: reconnectingListenStream<TurnCancelNotification>({
    connectionString,
    channel: TURN_CANCEL_NOTIFY_CHANNEL,
    parse: parseTurnCancelNotification,
    logger,
    onReconnect: rescan
      ? async () => (await rescan()).map((assistantTurnId) => ({ assistantTurnId }))
      : undefined,
  }),
});
