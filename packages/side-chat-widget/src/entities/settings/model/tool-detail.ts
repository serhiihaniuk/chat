// How much of each tool / host-command call the activity timeline shows. A
// user-facing setting (Settings → General), persisted per browser: "hidden"
// drops tool rows from the timeline entirely (reasoning thoughts stay),
// "name" shows the compact glyph + name row with nothing to expand, and
// "full" keeps the expandable row with the call's input/result payloads.
//
// Rendering-only: the payloads still travel to the browser inside activity
// events regardless of this level — a tool that must not expose its data needs
// server-side stripping, not this setting.

export const TOOL_DETAIL_LEVELS = ["hidden", "name", "full"] as const;

export type ToolDetailLevel = (typeof TOOL_DETAIL_LEVELS)[number];

export const DEFAULT_TOOL_DETAIL_LEVEL: ToolDetailLevel = "full";

export const isToolDetailLevel = (value: unknown): value is ToolDetailLevel =>
  typeof value === "string" && TOOL_DETAIL_LEVELS.some((level) => level === value);
