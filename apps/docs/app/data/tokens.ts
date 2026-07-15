/**
 * Token reference data for the docs token tables.
 *
 * These mirror the REAL widget tokens declared in
 * `packages/side-chat-widget/src/styles.css` (tier-1 on :root, tier-2/3 on
 * `.side-chat-widget-root`). Keep names/values in sync with that file when it
 * changes — the docs are the published contract.
 */
import { componentTokenGroups } from "./tokens-components";
import { primitiveTokenGroups } from "./tokens-primitives";

export interface TokenRow {
  token: string;
  resolvesTo: string;
  /** CSS property the token primarily drives. */
  property: string;
  /** Plain-English purpose. */
  usage: string;
}

export const tokenGroups: Record<string, readonly TokenRow[]> = {
  ...componentTokenGroups,
  ...primitiveTokenGroups,
  spacing: [
    {
      token: "--space-unit",
      resolvesTo: "0.25rem",
      property: "(base)",
      usage: "The single density lever. Every pad/gap is a multiple of this.",
    },
    {
      token: "--spacing",
      resolvesTo: "var(--space-unit, 0.25rem)",
      property: "(bridge)",
      usage: "Bridges the density lever to Tailwind v4 spacing utilities.",
    },
  ],
  sizing: [
    {
      token: "--size-sidebar",
      resolvesTo: "15.5rem",
      property: "width",
      usage: "Conversation rail width.",
    },
    {
      token: "--size-menu",
      resolvesTo: "17.625rem",
      property: "width",
      usage: "Dropdown / popover width.",
    },
    {
      token: "--size-measure-message",
      resolvesTo: "44.5rem",
      property: "max-width",
      usage: "Chat column max reading measure.",
    },
    {
      token: "--size-measure-empty",
      resolvesTo: "28.25rem",
      property: "max-width",
      usage: "Empty-state cluster cap.",
    },
    {
      token: "--size-header",
      resolvesTo: "3.25rem",
      property: "height",
      usage: "Panel header height (rail aligns to it).",
    },
    {
      token: "--size-icon-sm",
      resolvesTo: "0.875rem",
      property: "width/height",
      usage: "Compact glyph size for inline actions and status notices.",
    },
    {
      token: "--size-icon-md",
      resolvesTo: "1rem",
      property: "width/height",
      usage: "Standard glyph size for panel chrome and icon buttons.",
    },
    {
      token: "--size-control",
      resolvesTo: "2rem",
      property: "width/height",
      usage: "Header icon-button hit area.",
    },
    {
      token: "--size-touch",
      resolvesTo: "2.75rem",
      property: "min-size",
      usage: "Minimum mobile touch target.",
    },
  ],
  typography: [
    {
      token: "--text-2xs",
      resolvesTo: "0.6875rem / 1.4",
      property: "font-size/line",
      usage: "Overlines, group labels.",
    },
    {
      token: "--text-xs",
      resolvesTo: "0.75rem / 1.45",
      property: "font-size/line",
      usage: "Hints, subtitles, badges.",
    },
    {
      token: "--text-sm",
      resolvesTo: "0.8125rem / 1.5",
      property: "font-size/line",
      usage: "Field text, labels, row titles.",
    },
    {
      token: "--text-base",
      resolvesTo: "0.875rem / 1.55",
      property: "font-size/line",
      usage: "Default body / button text.",
    },
    {
      token: "--text-md",
      resolvesTo: "0.9375rem / 1.6",
      property: "font-size/line",
      usage: "Message text, header title.",
    },
    {
      token: "--text-lg",
      resolvesTo: "1.125rem / 1.4",
      property: "font-size/line",
      usage: "Empty-state heading.",
    },
    {
      token: "--text-xl",
      resolvesTo: "1.5rem / 1.25",
      property: "font-size/line",
      usage: "Section heading.",
    },
    {
      token: "--weight-normal",
      resolvesTo: "400",
      property: "font-weight",
      usage: "Body copy and quiet activity text.",
    },
    {
      token: "--weight-medium",
      resolvesTo: "500",
      property: "font-weight",
      usage: "Emphasized controls and compact row labels.",
    },
    {
      token: "--weight-semibold",
      resolvesTo: "600",
      property: "font-weight",
      usage: "Section and Markdown headings.",
    },
  ],
  radius: [
    {
      token: "--radius",
      resolvesTo: "0.625rem",
      property: "(base)",
      usage: "Corner-radius lever; scrubbed by the Corners control.",
    },
    {
      token: "--radius-sm",
      resolvesTo: "calc(var(--radius) * 0.6)",
      property: "border-radius",
      usage: "Tight insets (action chips).",
    },
    {
      token: "--radius-md",
      resolvesTo: "calc(var(--radius) * 0.8)",
      property: "border-radius",
      usage: "Buttons, rows, fields (--field-radius), segmented items.",
    },
    {
      token: "--radius-lg",
      resolvesTo: "var(--radius)",
      property: "border-radius",
      usage: "Cards, user bubble.",
    },
    {
      token: "--radius-xl",
      resolvesTo: "calc(var(--radius) * 1.4)",
      property: "border-radius",
      usage: "Panel, menu, composer, popovers. Proportional so Sharp (--radius:0) flattens to 0.",
    },
  ],
  color: [
    {
      token: "--background",
      resolvesTo: "oklch(0.994 0.003 264)",
      property: "background",
      usage: "App / panel base surface.",
    },
    {
      token: "--foreground",
      resolvesTo: "oklch(0.22 0.018 264)",
      property: "color",
      usage: "Primary text.",
    },
    {
      token: "--primary",
      resolvesTo: "oklch(0.26 0.028 264)",
      property: "background",
      usage: "Primary action fill, switch-on, active indicator.",
    },
    {
      token: "--muted",
      resolvesTo: "oklch(0.96 0.006 264)",
      property: "background",
      usage: "Muted surfaces, segmented track.",
    },
    {
      token: "--muted-foreground",
      resolvesTo: "oklch(0.5 0.02 264)",
      property: "color",
      usage: "Secondary text, icons.",
    },
    {
      token: "--accent",
      resolvesTo: "oklch(0.955 0.008 264)",
      property: "background",
      usage: "Hover surface for ghost rows/buttons.",
    },
    {
      token: "--border",
      resolvesTo: "oklch(0.91 0.009 264)",
      property: "border-color",
      usage: "Hairline dividers and outlines.",
    },
    {
      token: "--sidebar-border",
      resolvesTo: "oklch(0.91 0.009 264)",
      property: "border-color",
      usage: "Sidebar rail seam; feeds --rail-border and settings nav dividers.",
    },
    {
      token: "--destructive",
      resolvesTo: "oklch(0.577 0.245 27.3)",
      property: "color",
      usage: "Errors, destructive actions.",
    },
    {
      token: "--success",
      resolvesTo: "oklch(0.6 0.13 160)",
      property: "color",
      usage: "Completed tool rows.",
    },
    {
      token: "--sc-canvas",
      resolvesTo: "oklch(0.978 0.004 264)",
      property: "background",
      usage: "Conversation canvas behind messages.",
    },
  ],
  button: [
    {
      token: "--primary",
      resolvesTo: "tier-1",
      property: "background",
      usage: "Primary button fill.",
    },
    {
      token: "--primary-foreground",
      resolvesTo: "tier-1",
      property: "color",
      usage: "Primary button text.",
    },
    {
      token: "--secondary / --secondary-foreground",
      resolvesTo: "var(--muted) / var(--foreground)",
      property: "background/color",
      usage:
        "Secondary button fill and text; used by the rail New chat control and other secondary actions.",
    },
    {
      token: "--accent",
      resolvesTo: "tier-1",
      property: "background",
      usage: "Ghost button hover surface.",
    },
    {
      token: "--radius-md",
      resolvesTo: "calc(var(--radius) * 0.8)",
      property: "border-radius",
      usage: "Button corner radius.",
    },
    {
      token: "--size-control",
      resolvesTo: "2rem",
      property: "width/height",
      usage: "Icon-button box.",
    },
    {
      token: "--size-touch",
      resolvesTo: "2.75rem",
      property: "min-size",
      usage: "Minimum touch target on mobile.",
    },
  ],
  switch: [
    { token: "--switch-w", resolvesTo: "1.875rem", property: "width", usage: "Track width." },
    { token: "--switch-h", resolvesTo: "1.125rem", property: "height", usage: "Track height." },
    {
      token: "--switch-knob-size",
      resolvesTo: "0.875rem",
      property: "width/height",
      usage: "Knob diameter.",
    },
    {
      token: "--switch-inset",
      resolvesTo: "2px",
      property: "inset",
      usage: "Gap between knob and track edge (drives travel).",
    },
    {
      token: "--switch-track-on",
      resolvesTo: "var(--primary)",
      property: "background",
      usage: "Checked track fill.",
    },
    {
      token: "--switch-track-off",
      resolvesTo: "var(--input)",
      property: "background",
      usage: "Unchecked track fill.",
    },
    {
      token: "--switch-knob-fill",
      resolvesTo: "oklch(0.99 0 0)",
      property: "background",
      usage: "Knob fill (near-white).",
    },
  ],
  segmented: [
    {
      token: "--seg-pad",
      resolvesTo: "3px",
      property: "padding",
      usage: "Outer track inset around the items.",
    },
    {
      token: "--seg-radius",
      resolvesTo: "var(--radius-md)",
      property: "border-radius",
      usage: "Outer track radius.",
    },
    {
      token: "--seg-item-radius",
      resolvesTo: "calc(var(--radius-md) - 3px)",
      property: "border-radius",
      usage: "Active item radius (nested inside track).",
    },
    { token: "--muted", resolvesTo: "tier-1", property: "background", usage: "Track surface." },
    {
      token: "--background",
      resolvesTo: "tier-1",
      property: "background",
      usage: "Active item surface.",
    },
    {
      token: "--muted-foreground",
      resolvesTo: "tier-1",
      property: "color",
      usage: "Inactive item text.",
    },
  ],
};
