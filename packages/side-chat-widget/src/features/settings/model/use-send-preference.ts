import { useCallback, useState } from "react";

const DEFAULT_STORAGE_KEY = "side-chat-widget:send-preference";

export type SendPreferenceController = {
  readonly sendWithCtrlEnter: boolean;
  readonly setSendWithCtrlEnter: (next: boolean) => void;
};

/**
 * Owns the "Send with Ctrl+Enter" preference and its browser-local persistence.
 *
 * Follows the appearance-controls pattern (a fixed default key, always persisted —
 * no public prop), not the theme pattern (opt-in via a caller-supplied key): this
 * is an editor ergonomics choice the user sets once, so it should survive reloads
 * without host wiring. When on, the composer treats Ctrl/Cmd+Enter as send and a
 * bare Enter as a newline (`sendOnEnter = false`); when off, Enter sends.
 */
export const useSendPreference = ({
  storageKey = DEFAULT_STORAGE_KEY,
}: { readonly storageKey?: string | undefined } = {}): SendPreferenceController => {
  const [sendWithCtrlEnter, setState] = useState<boolean>(() => readStored(storageKey));
  const setSendWithCtrlEnter = useCallback(
    (next: boolean): void => {
      setState(next);
      writeStored(storageKey, next);
    },
    [storageKey],
  );
  return { sendWithCtrlEnter, setSendWithCtrlEnter };
};

const readStored = (storageKey: string | undefined): boolean => {
  if (!storageKey || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
};

const writeStored = (storageKey: string | undefined, value: boolean): void => {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, value ? "true" : "false");
  } catch {
    // Best-effort persistence; a storage failure must not break sending.
  }
};
