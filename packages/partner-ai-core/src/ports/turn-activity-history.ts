/**
 * Whether the service persists a turn's activity events (reasoning summaries,
 * tool calls, host commands) alongside the assistant message.
 *
 * `full` stores the turn's activity events on the assistant message and the
 * history read returns them, so a reloaded transcript (or another device) shows
 * the thinking the user watched live. `disabled` keeps the pre-existing
 * behavior: activity stays in the live stream only and the accumulator never
 * retains it, so nothing tool- or reasoning-shaped lands in message storage.
 *
 * This is a service-config decision (`sidechat.config.ts`), not a per-request
 * or per-user toggle: what the server stores is a data-retention posture.
 */
export const TURN_ACTIVITY_HISTORY_MODES = {
  FULL: "full",
  DISABLED: "disabled",
} as const;

export type TurnActivityHistoryMode =
  (typeof TURN_ACTIVITY_HISTORY_MODES)[keyof typeof TURN_ACTIVITY_HISTORY_MODES];

export const DEFAULT_TURN_ACTIVITY_HISTORY_MODE: TurnActivityHistoryMode =
  TURN_ACTIVITY_HISTORY_MODES.FULL;
