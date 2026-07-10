import type { DiagnosticLogger } from "@side-chat/shared";

import { HOST_COMMAND_RESULT_NOTIFY_CHANNEL } from "#schema-contract";
import {
  parseHostCommandResultNotification,
  type HostCommandResultNotification,
  type HostCommandResultNotificationSource,
} from "../../notifications/host-command-result-notifications.js";
import { reconnectingListenStream } from "./reconnecting-listen-source.js";

/**
 * Build the per-instance Postgres listener for host-command results.
 *
 * The result row and `pg_notify` call are written in one transaction. This source
 * uses one dedicated, self-healing connection rather than the query pool, so it
 * also works with PgBouncer transaction pooling. A missed signal is safe because
 * the resolver polls the durable result row.
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
