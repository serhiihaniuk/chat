import { useEffect, useMemo, useRef } from "react";

import { carryTranscriptActivity, type WidgetMessage, type WidgetRunNotice } from "#entities/chat";
import {
  WIDGET_RUN_STATUSES,
  isTerminalRunStatus,
  type WidgetRunState,
} from "../run/widget-run-state.js";

/**
 * What the conversation view renders: which transcript is visible and which
 * notice accompanies it.
 *
 * Source is the live run state plus the loaded history; target is the message
 * list and notice `useWidgetChat` returns to the shell. Extracted from the main
 * hook so the "who owns the visible transcript" rules read in one place.
 */

/**
 * The displayed transcript: the live run's messages while a run is visible,
 * otherwise the loaded history with the last run's activity carried over.
 *
 * History normally carries persisted activity when retention is enabled. If a
 * row has no timeline, the run→history handoff would drop the thinking info the
 * user just watched. Snapshot the latest visible run transcript per conversation
 * and use it only to fill that gap; durable history remains authoritative. The
 * snapshot is tab-local, so a reload depends on history alone.
 */
export const useVisibleMessagesWithCarriedActivity = (
  visibleRun: WidgetRunState | undefined,
  historyMessages: readonly WidgetMessage[] | undefined,
  conversationId: string | undefined,
): readonly WidgetMessage[] => {
  const lastRunTranscriptRef = useRef<
    { readonly conversationId: string; readonly messages: readonly WidgetMessage[] } | undefined
  >(undefined);
  // Snapshot in an effect, not during render (React forbids render-phase ref
  // writes). The snapshot is only READ on a later render where the run has
  // cleared, and the run's final state always commits a render of its own before
  // the handoff clears it, so an effect-time write is never a render too late.
  useEffect(() => {
    if (visibleRun?.conversationId) {
      lastRunTranscriptRef.current = {
        conversationId: visibleRun.conversationId,
        messages: visibleRun.messages,
      };
    }
  }, [visibleRun]);
  return useMemo(() => {
    if (visibleRun) return visibleRun.messages;
    const transcript = historyMessages ?? [];
    const snapshot = lastRunTranscriptRef.current;
    return snapshot && snapshot.conversationId === conversationId
      ? carryTranscriptActivity(transcript, snapshot.messages)
      : transcript;
  }, [conversationId, historyMessages, visibleRun]);
};

// Turn the run + message into the notice the conversation view renders: a blocked
// turn gets the calm guard notice, any other message is the retryable error
// surface, and a clean or cancelled run shows nothing.
export const toRunNotice = (
  run: WidgetRunState | undefined,
  message: string | undefined,
): WidgetRunNotice | undefined => {
  if (!message) return undefined;
  return run?.status === WIDGET_RUN_STATUSES.BLOCKED
    ? { kind: "blocked", message }
    : { kind: "error", message };
};

// A run owns its conversation's transcript only while it is NON-terminal: the
// moment it ends, history loading resumes so the run→history handoff (and the
// header Refresh button) can read the committed answer from the server.
export const runOwnsHistory = (
  run: WidgetRunState | undefined,
  conversationId: string,
  streamOwnedConversationId: string | undefined,
): boolean =>
  run !== undefined &&
  !isTerminalRunStatus(run.status) &&
  conversationId === streamOwnedConversationId;

// A run's messages belong to the displayed conversation when their ids match, or
// when the run has not yet been assigned a conversation (it was just started in
// the current view). One active run per instance keeps this unambiguous.
export const isRunVisibleFor = (
  runConversationId: string | undefined,
  selectedConversationId: string | undefined,
): boolean => runConversationId === undefined || runConversationId === selectedConversationId;
