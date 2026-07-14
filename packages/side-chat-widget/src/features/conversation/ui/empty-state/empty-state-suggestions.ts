import { Code2Icon, FileTextIcon, LightbulbIcon, PenLineIcon, type LucideIcon } from "lucide-react";

import type { WidgetHostBridge } from "@side-chat/host-bridge";

import type { WidgetEmptyStateSuggestion } from "./widget-empty-state.js";

/** One starter prompt the host offers before the conversation has any messages. */
export type EmptyStateQuickAction = {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
};

// A small rotation so suggestion rows read as distinct actions without requiring
// the host to supply per-action icons.
const SUGGESTION_ICONS: readonly LucideIcon[] = [
  FileTextIcon,
  LightbulbIcon,
  Code2Icon,
  PenLineIcon,
];

/** Attach the rotating leading icon to each host-supplied starter prompt. */
export const toEmptyStateSuggestions = (
  quickActions: readonly EmptyStateQuickAction[],
): readonly WidgetEmptyStateSuggestion[] =>
  quickActions.map((action, index) => ({
    ...action,
    icon: SUGGESTION_ICONS[index % SUGGESTION_ICONS.length] ?? FileTextIcon,
  }));

// Honest empty-state copy: only claim to see the page when the optional bridge
// actually exposes a callable context collector.
export const emptyStateDescription = (
  hostBridge: WidgetHostBridge | undefined,
  labels: { readonly emptyStateWithContext: string; readonly emptyStateWithoutContext: string },
): string =>
  typeof hostBridge?.getContext === "function"
    ? labels.emptyStateWithContext
    : labels.emptyStateWithoutContext;
