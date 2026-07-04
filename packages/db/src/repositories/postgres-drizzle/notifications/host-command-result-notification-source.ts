import type { DiagnosticLogger } from "@side-chat/shared";

import { HOST_COMMAND_RESULT_NOTIFY_CHANNEL } from "#schema-contract";
import {
  parseHostCommandResultNotification,
  type HostCommandResultNotification,
  type HostCommandResultNotificationSource,
} from "../../notifications/host-command-result-notifications.js";
import { reconnectingListenStream } from "./reconnecting-listen-source.js";

/**
 * Build the per-instance Postgres `LISTEN` source for host-command results.
 *
 * `recordHostCommandResult` `pg_notify`s `HOST_COMMAND_RESULT_NOTIFY_CHANNEL` in
 * the same transaction as a resolved result write; this source holds one
 * dedicated, self-healing connection (not from the query pool, so it survives
 * PgBouncer transaction pooling) and surfaces parsed signals to the result
 * dispatcher. No reconnect rescan is needed — the resolver's result poll reads the
 * durable row, so a signal missed during an outage still settles the tool loop.
 */
export const createPostgresHostCommandResultNotificationSource = (
  connectionString: string,
  logger?: DiagnosticLogger,
): HostCommandResultNotificationSource => ({
  notifications: reconnectingListenStream<HostCommandResultNotification>({
    connectionString,
    channel: HOST_COMMAND_RESULT_NOTIFY_CHANNEL,
    parse: parseHostCommandResultNotification,
    logger,
  }),
});
