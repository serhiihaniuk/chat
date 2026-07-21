import { useCallback, useState } from "react";
import { parseJsonRecord } from "@side-chat/shared";

import type { SideChatWidgetPanelSize } from "./panel-size.js";

const DEFAULT_STORAGE_KEY = "side-chat-widget:panel-size";

export type WidgetPanelSizeController = {
  readonly panelSize: SideChatWidgetPanelSize | undefined;
  readonly setPanelSize: (size: SideChatWidgetPanelSize) => void;
};

// Owns the resizable panel's size and its browser-local persistence, so a refresh
// or a fresh iframe load restores the size the user dragged to instead of the
// default. Mirrors useWidgetTheme: read once on init, write on every change,
// best-effort (private-mode or quota errors must never break resizing). Returns
// `undefined` when nothing is stored and no default is given, so the panel keeps
// its own built-in default.
export const useWidgetPanelSize = ({
  defaultPanelSize,
  storageKey = DEFAULT_STORAGE_KEY,
}: {
  readonly defaultPanelSize: SideChatWidgetPanelSize | undefined;
  readonly storageKey: string | undefined;
}): WidgetPanelSizeController => {
  const [panelSize, setStoredSize] = useState<SideChatWidgetPanelSize | undefined>(
    () => readStoredPanelSize(storageKey) ?? defaultPanelSize,
  );

  const setPanelSize = useCallback(
    (next: SideChatWidgetPanelSize) => {
      setStoredSize(next);
      writeStoredPanelSize(storageKey, next);
    },
    [storageKey],
  );

  return { panelSize, setPanelSize };
};

const readStoredPanelSize = (
  storageKey: string | undefined,
): SideChatWidgetPanelSize | undefined => {
  if (!storageKey || typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? parsePanelSize(stored) : undefined;
  } catch {
    return undefined;
  }
};

const writeStoredPanelSize = (
  storageKey: string | undefined,
  size: SideChatWidgetPanelSize,
): void => {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ width: size.width, height: size.height }),
    );
  } catch {
    // Persistence is best-effort; private-mode or quota errors must not break resizing.
  }
};

// A stored size only restores when both dimensions are positive finite numbers, so
// a corrupted or hand-edited entry falls back to the default instead of rendering a
// broken panel.
const parsePanelSize = (raw: string): SideChatWidgetPanelSize | undefined => {
  const parsed = parseJsonRecord(raw);
  if (!parsed) return undefined;
  const width = parsed["width"];
  const height = parsed["height"];
  if (!isPositiveFinite(width) || !isPositiveFinite(height)) return undefined;
  return { width, height };
};

const isPositiveFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
