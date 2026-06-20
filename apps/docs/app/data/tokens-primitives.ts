/**
 * Primitive token groups - generated from the real widget tokens documented by the
 * primitives workflow; mirrors packages/side-chat-widget/src/styles.css. Spread into
 * `tokenGroups` in ./tokens.ts so <TokenTable group="<id>" /> resolves.
 */
import type { TokenRow } from "./tokens";

export const primitiveTokenGroups: Record<string, readonly TokenRow[]> = {
  "row": [
    { token: "--row-bg-hover", resolvesTo: "var(--accent)", property: "background", usage: "Hover/highlight surface for a row; follows the Accent surface control." },
    { token: "--row-bg-active", resolvesTo: "var(--accent)", property: "background", usage: "Active-row fill on a standalone conversation button; follows the Accent surface control." },
    { token: "--primary", resolvesTo: "tier-1", property: "color / background", usage: "Trailing indicator: the selected check and the aria-current dot." },
    { token: "--foreground", resolvesTo: "tier-1", property: "color", usage: "Row title text (text-foreground on the medium-weight line)." },
    { token: "--muted-foreground", resolvesTo: "tier-1", property: "color", usage: "Row subtitle / overline (text-muted-foreground)." },
    { token: "--border", resolvesTo: "tier-1", property: "border-color", usage: "Outline of the form-A Select trigger (border-input resolves here)." },
    { token: "--media-fill", resolvesTo: "var(--muted)", property: "background", usage: "Leading sc-media tile behind the model icon in the Base UI item form." },
    { token: "--media-fg", resolvesTo: "var(--muted-foreground)", property: "color", usage: "Icon color inside the leading sc-media tile." },
  ],
  "media": [
    { token: "--media-size", resolvesTo: "1.625rem", property: "width / height", usage: "Avatar box size (26px); single-sourced so all avatars resize together" },
    { token: "--media-radius", resolvesTo: "var(--radius-md)", property: "border-radius", usage: "Avatar corner rounding" },
    { token: "--media-fill", resolvesTo: "var(--muted)", property: "background", usage: "Avatar background fill (registered in the docs token table as --media-bg)" },
    { token: "--media-border", resolvesTo: "var(--border)", property: "border-color", usage: "1px avatar frame" },
    { token: "--media-fg", resolvesTo: "var(--muted-foreground)", property: "color", usage: "Initials / glyph color; inherited by currentColor SVG/img content" },
  ],
  "field": [
    { token: "--field-bg", resolvesTo: "var(--background)", property: "background", usage: "Fill of the input/textarea control surface." },
    { token: "--field-border", resolvesTo: "var(--input)", property: "border-color", usage: "Resting 1px border around the control (becomes --ring on focus, --destructive when invalid)." },
    { token: "--field-radius", resolvesTo: "var(--radius-md)", property: "border-radius", usage: "Corner radius of the control." },
    { token: "--field-px", resolvesTo: "calc(var(--spacing) * 3)", property: "padding-inline", usage: "Horizontal inset of the control's text from its border." },
    { token: "--field-py", resolvesTo: "calc(var(--spacing) * 2.5)", property: "padding-block", usage: "Vertical inset of the control's text, setting the control height." },
  ],
  "tabs": [
    { token: "--muted-foreground", resolvesTo: "tier-1", property: "color", usage: "Idle tab trigger label/icon (text-muted-foreground) and panel body copy." },
    { token: "--foreground", resolvesTo: "tier-1", property: "color", usage: "Selected trigger label (selected:text-foreground) and panel headings." },
    { token: "--accent", resolvesTo: "tier-1", property: "background-color", usage: "Trigger hover fill (hover:bg-accent)." },
    { token: "--sidebar-accent", resolvesTo: "tier-1", property: "background-color", usage: "Selected trigger fill (selected:bg-sidebar-accent)." },
    { token: "--radius-md", resolvesTo: "calc(var(--radius) * 0.8)", property: "border-radius", usage: "Trigger corner radius (rounded-md)." },
    { token: "--border", resolvesTo: "tier-1", property: "border-color", usage: "Default outline/border color inherited by widget descendants (@apply border-border)." },
  ],
  "select": [
    { token: "--popover", resolvesTo: "tier-1", property: "background-color", usage: "Popup surface fill - `bg-popover` applied to the [data-slot=\"select-content\"] slot." },
    { token: "--popover-foreground", resolvesTo: "tier-1", property: "color", usage: "Popup text color - `text-popover-foreground` on the select-content slot." },
    { token: "--border", resolvesTo: "tier-1", property: "border-color", usage: "Popup hairline border - `border border-border` on the select-content slot." },
    { token: "--input", resolvesTo: "tier-1", property: "border-color", usage: "Trigger border - `border border-input` on Select.Trigger." },
    { token: "--accent", resolvesTo: "tier-1", property: "background-color", usage: "Active row fill - `highlighted:bg-accent` on each Select.Item (pointer or keyboard)." },
    { token: "--primary", resolvesTo: "tier-1", property: "color", usage: "Selected-row check color - `text-primary` on Select.ItemIndicator." },
    { token: "--muted-foreground", resolvesTo: "tier-1", property: "color", usage: "Trigger chevron and the Default model / Selected captions - `text-muted-foreground`." },
  ],
  "combobox": [
    { token: "--popover", resolvesTo: "tier-1", property: "background", usage: "Popup surface fill - the `data-slot=\"combobox-content\"` panel that holds the search input and list." },
    { token: "--popover-foreground", resolvesTo: "tier-1", property: "color", usage: "Default text color inside the portaled popup (input text, item labels)." },
    { token: "--border", resolvesTo: "tier-1", property: "border-color", usage: "Popup outline plus the divider under the `Combobox.Input` search row (`border-b border-border`)." },
    { token: "--accent", resolvesTo: "tier-1", property: "background", usage: "Highlighted item fill - `highlighted:bg-accent` paints the row the fuzzy filter marks `data-highlighted`." },
    { token: "--primary", resolvesTo: "tier-1", property: "color", usage: "Selected `Combobox.ItemIndicator` check color (`text-primary` shown via `selected:opacity-100`)." },
    { token: "--muted-foreground", resolvesTo: "tier-1", property: "color", usage: "Search glyph, input placeholder, item `desc` subtitle, the `sc-combo-empty` no-results row, and the trigger chevron." },
    { token: "--foreground", resolvesTo: "tier-1", property: "color", usage: "Primary item/trigger label text (`text-foreground font-medium`)." },
    { token: "--media-fill", resolvesTo: "var(--muted)", property: "background", usage: "Per-row leading icon tile - items render their glyph inside the shared `sc-media` avatar (`--media-*` family)." },
  ],
  "menu": [
    { token: "--menu-bg", resolvesTo: "var(--popover)", property: "background", usage: "Popup surface fill (applied via the data-slot=\"dropdown-menu-content\" rule's bg-popover, not in JSX)" },
    { token: "--menu-fg", resolvesTo: "var(--popover-foreground)", property: "color", usage: "Default text color of menu items / popup content" },
    { token: "--menu-border", resolvesTo: "var(--border)", property: "border-color", usage: "1px hairline around the popup surface" },
    { token: "--menu-radius", resolvesTo: "var(--radius-xl)", property: "border-radius", usage: "Outer corner radius of the popup" },
    { token: "--menu-shadow", resolvesTo: "var(--shadow-popover)", property: "box-shadow", usage: "Popover elevation under the floating menu" },
    { token: "--menu-item-radius", resolvesTo: "var(--radius-md)", property: "border-radius", usage: "Rounded corners of each highlighted item/checkbox row" },
    { token: "--menu-item-bg-hover", resolvesTo: "var(--accent)", property: "background", usage: "Row fill in the highlighted state (pointer or keyboard active)" },
    { token: "--menu-item-check", resolvesTo: "var(--primary)", property: "color", usage: "Tint of the CheckboxItemIndicator check glyph" },
  ],
  "tooltip": [
    { token: "--popover", resolvesTo: "tier-1", property: "background-color", usage: "Tooltip popup surface (bg-popover via the tooltip-content slot)" },
    { token: "--popover-foreground", resolvesTo: "tier-1", property: "color", usage: "Tooltip label text (text-popover-foreground)" },
    { token: "--border", resolvesTo: "tier-1", property: "border-color", usage: "Tooltip popup hairline (border-border)" },
    { token: "--shadow-popover", resolvesTo: "var(--shadow-popover)", property: "box-shadow", usage: "Tooltip popup elevation (shadow-popover)" },
    { token: "--radius-md", resolvesTo: "calc(var(--radius) * 0.8)", property: "border-radius", usage: "Tooltip popup corner radius (rounded-md)" },
    { token: "--muted-foreground", resolvesTo: "tier-1", property: "color", usage: "Icon-button trigger glyph color (sc-icon-btn)" },
    { token: "--accent", resolvesTo: "tier-1", property: "background-color", usage: "Trigger hover / data-popup-open fill (sc-icon-btn)" },
  ],
  "badge": [
    { token: "--muted", resolvesTo: "tier-1", property: "background-color", usage: "Fill of the non-interactive Badge status pill (bg-muted)." },
    { token: "--muted-foreground", resolvesTo: "tier-1", property: "color", usage: "Text + icon color of the Badge, kept quiet at text-2xs (text-muted-foreground)." },
    { token: "--border", resolvesTo: "tier-1", property: "border-color", usage: "1px hairline outline around both the Badge and the Suggestion chip (border-border)." },
    { token: "--card", resolvesTo: "tier-1", property: "background-color", usage: "Resting fill of the interactive Suggestion chip so it lifts off the canvas (bg-card)." },
    { token: "--foreground", resolvesTo: "tier-1", property: "color", usage: "Full-strength label text inside the Suggestion chip (text-foreground), since it is actionable." },
    { token: "--accent", resolvesTo: "tier-1", property: "background-color (:hover)", usage: "Hover fill of the Suggestion chip - the only hover affordance, allowed because it is a real button (hover:bg-accent)." },
  ],
  "scroll-area": [
    { token: "--scrollarea-w", resolvesTo: "0.5rem", property: "width / height", usage: "Thickness of the vertical overlay scrollbar track (height when horizontal)." },
    { token: "--scrollarea-thumb", resolvesTo: "var(--border)", property: "background", usage: "Fill of the draggable scrollbar thumb." },
    { token: "--border", resolvesTo: "tier-1", property: "background / border-color", usage: "Tier-1 source for the thumb fill and the Viewport border callers add." },
    { token: "--muted-foreground", resolvesTo: "tier-1", property: "color", usage: "Secondary text color used for the scrollable row content in the demo." },
    { token: "--radius-lg", resolvesTo: "var(--radius)", property: "border-radius", usage: "Corner radius for the bounded Viewport panel (rounds the scroll surface)." },
    { token: "--sc-canvas", resolvesTo: "tier-1", property: "background", usage: "Recessed surface fill behind the scrollable content." },
  ],
  "separator": [
    { token: "--border", resolvesTo: "tier-1", property: "background-color", usage: "The rule's own color, applied via the bg-border class the wrapper sets by default; this is the only color the separator paints." },
    { token: "--foreground", resolvesTo: "tier-1", property: "color", usage: "Primary text the rule separates (e.g. the section heading above a horizontal divider)." },
    { token: "--muted-foreground", resolvesTo: "tier-1", property: "color", usage: "Secondary/inline text on either side of the rule (hint line, inline Drafts | Archived items)." },
  ],
  "collapsible": [
    { token: "--border", resolvesTo: "tier-1", property: "border-left-color", usage: "Left border of the open panel (`sc-collapsible-panel` -> `border-l-2 border-border`), marking the indented fold body." },
    { token: "--muted-foreground", resolvesTo: "tier-1", property: "color", usage: "Trigger row text + chevron (`text-muted-foreground`); also the secondary panel content lines." },
    { token: "--foreground", resolvesTo: "tier-1", property: "color", usage: "Primary panel content text (`text-foreground`) revealed when the fold is open." },
    { token: "--dur", resolvesTo: "200ms", property: "transition-duration", usage: "Height-animation duration for the panel reveal/collapse (`transition: height var(--dur) var(--ease-out)`)." },
  ],
};
