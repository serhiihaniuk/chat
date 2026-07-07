import { useCallback, useState } from "react";

import {
  DEFAULT_TOOL_DETAIL_LEVEL,
  isToolDetailLevel,
  type ToolDetailLevel,
} from "#entities/settings";

const DEFAULT_STORAGE_KEY = "side-chat-widget:tool-detail";

export type ToolDetailPreferenceController = {
  readonly toolDetail: ToolDetailLevel;
  readonly setToolDetail: (next: string) => void;
};

/**
 * Owns the "Tool call details" level (Settings → General) and its browser-local
 * persistence.
 *
 * Follows the send-preference pattern (a fixed default key, always persisted —
 * no public prop): how much of a tool call the timeline shows is a reading
 * preference the user sets once, so it should survive reloads without host
 * wiring. The setter validates against the canonical levels so a stale or
 * foreign stored value can never leave the union.
 */
export const useToolDetailPreference = ({
  storageKey = DEFAULT_STORAGE_KEY,
}: { readonly storageKey?: string | undefined } = {}): ToolDetailPreferenceController => {
  const [toolDetail, setState] = useState<ToolDetailLevel>(() => readStored(storageKey));
  const setToolDetail = useCallback(
    (next: string): void => {
      if (!isToolDetailLevel(next)) return;
      setState(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );
  return { toolDetail, setToolDetail };
};

const readStored = (storageKey: string | undefined): ToolDetailLevel => {
  if (!storageKey || typeof window === "undefined") return DEFAULT_TOOL_DETAIL_LEVEL;
  try {
    const stored = window.localStorage.getItem(storageKey);
    return isToolDetailLevel(stored) ? stored : DEFAULT_TOOL_DETAIL_LEVEL;
  } catch {
    return DEFAULT_TOOL_DETAIL_LEVEL;
  }
};

const writeStored = (storageKey: string | undefined, value: ToolDetailLevel): void => {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // Best-effort persistence; a storage failure must not break rendering.
  }
};
