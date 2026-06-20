// Workflow script (run via the Workflow tool). Globals agent/parallel/phase/log
// are injected by the runtime. Builds every §8 primitive and §9 composition of the
// design-system-component-contract as one greenfield file each, on the already-built
// & verified foundation (styles.css tokens/variants/hook classes + widget-root portal).

/* global agent, parallel, phase, log */

/**
 * @typedef {"Primitives" | "Compositions"} BuildPhase
 * @typedef {{ readonly phase: BuildPhase, readonly file: string, readonly section: string, readonly partB: string }} ComponentSpec
 * @typedef {{ readonly file: string, readonly sectionExport: string, readonly status: string, readonly gatesSelfChecked: boolean, readonly componentExports?: readonly string[], readonly notes?: string }} BuildManifest
 */

const runAgent =
  /** @type {(prompt: string, options: { readonly label: string | undefined, readonly phase: BuildPhase, readonly schema: unknown }) => Promise<BuildManifest | null>} */ (
    agent
  );
const runParallel =
  /** @type {<T>(tasks: readonly (() => Promise<T>)[]) => Promise<T[]>} */ (parallel);
const runPhase = /** @type {(name: string) => void} */ (phase);
const runLog = /** @type {(message: string) => void} */ (log);

export const meta = {
  name: "sidechat-component-contract-build",
  description:
    "Greenfield-build every §8 primitive + §9 composition 1:1 from the widget build contract, each shipping a showcase demo section",
  phases: [
    { title: "Primitives", detail: "one agent per §8 primitive (+ §10 markdown)" },
    { title: "Compositions", detail: "one agent per §9 composition, reusing primitives" },
  ],
};

// ───────────────────────── Shared preamble (Part A + foundation facts) ─────────────────────────
const PREAMBLE = [
  "You are building ONE file of a greenfield React component kit, strictly 1:1 to a design-system contract.",
  "The shared FOUNDATION already exists and is verified — you MUST NOT edit it, only consume it:",
  "",
  "FOUNDATION (do not recreate, do not edit):",
  "- styles.css already defines EVERY token, @custom-variant, and @utility hook class you will use. Assume they exist; do NOT open or edit styles.css.",
  '- Tailwind v4, utility-first. Import the class helper: import { cn } from "#shared/lib/cn";',
  '- The widget root + portal target: import { usePortalContainer } from "#shared/ui/widget-root";  (call it once at the top of a component: const container = usePortalContainer(); )',
  '- Base UI parts import path is @base-ui/react/<part>, e.g. import { Switch } from "@base-ui/react/switch"; import { Menu } from "@base-ui/react/menu"; (parts: switch, menu, popover, select, combobox, scroll-area, field, toggle, toggle-group, tabs, tooltip, separator, collapsible, dialog, button, avatar, input).',
  '- Icons: import { Check, ChevronDown, Plus, ArrowUp, Search, Settings, Brain, X, Copy, RotateCcw, Paperclip, Globe, TriangleAlert, Sparkles, Wrench, Plus as PlusIcon } from "lucide-react";  (any lucide icon name is available).',
  "- React 19 + TypeScript strict. Functional components. The Section demo returns ReactElement.",
  "",
  "THE FIVE HARD GATES — your file fails review if any is true (each is a grep or DOM check):",
  "G1 No arbitrary values: never w-[248px], text-[13px], rounded-[10px], p-[12px], bg-[var(--x)], min-w-[..]. Use registered utilities or a hook class. (Bracket variants on a component's OWN semantic attributes like data-[from=user]: / aria-[current=true]: are allowed — they do not match the G1 grep — but Base UI state must use named variants, never brackets, see G4.)",
  "G2 No literal colours: never #fff, rgb(), oklch(), hsl(), or tailwind palette names (zinc/slate/neutral/gray/stone-NNN). Colour only ever via a registered colour utility.",
  "G3 Every utility is registered. Allowed colour utilities (bg-/text-/border-/ring-/fill-/stroke-): background, foreground, card(-foreground), popover(-foreground), primary(-foreground), secondary(-foreground), muted(-foreground), accent(-foreground), destructive (NO -foreground exists), success, sc-canvas, border, input, ring, sidebar(-foreground/-primary/-primary-foreground/-accent/-accent-foreground/-border/-ring), message-user(-foreground), chart-1..5. Radius: rounded-sm/md/lg/xl. Type (with paired leading): text-2xs text-xs text-sm text-base text-md text-lg text-xl. Named sizes: w-sidebar w-menu h-header size-control size-touch max-w-measure-message max-w-measure-empty. Shadow: shadow-card shadow-popover shadow-panel. Ease: ease-out. Leading: leading-message. PLUS all standard Tailwind layout/spacing/flex utilities (flex, grid, items-*, justify-*, gap-*, p-*, px-*, py-*, m-*, w-*, h-*, size-8, min-w-0, truncate, rounded-full, absolute, relative, etc.) are fine. If a colour/size/radius/shadow you need is NOT in this list, use the component's hook class instead — do NOT invent a utility name.",
  "G4 State via named variants. For BASE UI part state use ONLY these registered variants, never :hover on a Base UI part and never a data-[...]: bracket: highlighted: (item active by pointer OR keyboard), selected:, pressed:, checked:, unchecked:, popupopen:, panelopen:, uiopen:, uidisabled:, invalid:, scrolling:, hovering:, starting:, ending:. hover: and focus-visible: are allowed ONLY on plain non-Base-UI <button>/<a> elements. A component's OWN state on a plain element may use aria-[current=true]: / data-[from=user]: / a hook class reading &[data-armed] (these are in the contract examples).",
  "G4a Declared component-token shorthand is allowed for state surfaces, e.g. bg-(--row-bg-hover), bg-(--row-bg-active), bg-(--convo-item-bg-hover), and bg-(--convo-item-bg-active). Do not use raw bracketed var() values.",
  "G5 Popups portal into root: every Menu/Popover/Select/Combobox/Tooltip/Dialog Portal MUST get container={container} where const container = usePortalContainer();",
  "G6 Every required Base UI part in the part-tree must be present (a Select needs Positioner, a Switch needs Thumb, a menu Item that lists an ItemIndicator must include it).",
  "",
  "OUTPUT RULES:",
  "- Write exactly ONE file, at the path given below, with the Write tool. Do not create or edit any other file (especially not styles.css).",
  "- The file MUST export the component(s) named in your task AND a demo named exactly as given: export function <Section>(): ReactElement — a SELF-CONTAINED, statically rendered demo (local useState + mock data, no props, no network). It will be mounted INSIDE an already-themed <SideChatWidgetRoot> on the showcase, so do NOT wrap it in another root and do NOT import styles.",
  "- The demo must show the component in its meaningful states (e.g. on/off, idle/armed, default/highlighted/selected, running/success/error) so the contract is represented 1:1.",
  "- After writing, run these greps on YOUR file and fix any hit before returning:",
  "    grep -nE '\\[[0-9]|\\[var\\(|\\[#|\\[rgb|\\[oklch' <file>     (G1 — must be empty)",
  "    grep -nE '#[0-9a-fA-F]{3,}|rgb\\(|oklch\\(|hsl\\(|\\b(zinc|slate|neutral|gray|stone)-[0-9]' <file>   (G2 — must be empty)",
  "    grep -nE ':hover|data-\\[' <file>   (review each hit: :hover only on plain buttons; data-[ only for the component's own aria/data state, NEVER Base UI state)",
  "- Keep it idiomatic and minimal. Match the contract's code snippets closely. Comments sparse.",
  "- Return the manifest object (file, componentExports, sectionExport, status, gatesSelfChecked, notes).",
].join("\n");

// Roster handed to every agent so cross-file imports use exact paths + names.
const ROSTER = [
  "COMPONENT ROSTER (import siblings by these exact specifiers + export names; reusable exports noted, otherwise build from Base UI directly as the contract shows):",
  "Primitives (src/shared/ui/):",
  "  switch.tsx        #shared/ui/switch        -> Switch, SwitchSection",
  "  menu.tsx          #shared/ui/menu          -> MenuSection (consumers use Base UI Menu + data-slot=dropdown-menu-content directly)",
  "  scroll-area.tsx   #shared/ui/scroll-area   -> ScrollArea (Root/Viewport/Scrollbar/Thumb wrapper), ScrollAreaSection",
  "  row.tsx           #shared/ui/row           -> RowSection (Row is a className pattern; consumers inline it)",
  "  media.tsx         #shared/ui/media         -> Media, MediaSection",
  "  field.tsx         #shared/ui/field         -> FieldSection (consumers use Base UI Field directly)",
  "  button.tsx        #shared/ui/button        -> Button, IconButton, ButtonSection",
  "  segmented.tsx     #shared/ui/segmented     -> Segmented, SegmentedSection",
  "  tabs.tsx          #shared/ui/tabs          -> TabsSection (consumers use Base UI Tabs directly)",
  "  select.tsx        #shared/ui/select        -> SelectSection (consumers use Base UI Select + data-slot=select-content directly)",
  "  combobox.tsx      #shared/ui/combobox      -> ComboboxSection (consumers use Base UI Combobox + data-slot=combobox-content directly)",
  "  badge.tsx         #shared/ui/badge         -> Badge, Suggestion, BadgeSection",
  "  tooltip.tsx       #shared/ui/tooltip       -> TooltipSection",
  "  separator.tsx     #shared/ui/separator     -> SeparatorSection",
  "  collapsible.tsx   #shared/ui/collapsible   -> CollapsibleSection",
  "  ../ai/markdown-content.tsx  #shared/ai/markdown-content -> MarkdownContent, MarkdownSection",
  "Compositions (src/shared/ui/):",
  "  conversation-item.tsx      #shared/ui/conversation-item      -> ConversationItem, ConversationItemSection",
  "  conversation-grouping.tsx  #shared/ui/conversation-grouping  -> ConversationGroupingSection",
  "  tools-menu.tsx             #shared/ui/tools-menu             -> ToolsMenu, ToolsMenuSection",
  "  model-selector.tsx         #shared/ui/model-selector         -> ModelSelector, ModelSelectorSection",
  "  composer.tsx               #shared/ui/composer               -> Composer, ComposerSection",
  "  message.tsx                #shared/ui/message                -> Message, MessageSection",
  "  message-actions.tsx        #shared/ui/message-actions        -> MessageActions, MessageActionsSection",
  "  tool-row.tsx               #shared/ui/tool-row               -> ToolRow, ToolRowSection",
  "  reasoning.tsx              #shared/ui/reasoning              -> Reasoning, ReasoningSection",
  "  error-notice.tsx           #shared/ui/error-notice           -> ErrorNotice, ErrorNoticeSection",
  "  settings.tsx               #shared/ui/settings               -> SettingsPanel, SettingsSection",
  "  shell.tsx                  #shared/ui/shell                  -> Shell, ShellSection",
].join("\n");

const MANIFEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["file", "sectionExport", "status", "gatesSelfChecked"],
  properties: {
    file: { type: "string", description: "path written, relative to repo root" },
    componentExports: { type: "array", items: { type: "string" } },
    sectionExport: { type: "string", description: "the exact <Xxx>Section export name" },
    status: { type: "string", enum: ["done", "partial"] },
    gatesSelfChecked: {
      type: "boolean",
      description: "true if G1/G2 greps returned empty on your file",
    },
    notes: {
      type: "string",
      description: "anything the assembler/reviewer should know (deviations, TODOs)",
    },
  },
};

// ───────────────────────── Component contracts (Part B per file) ─────────────────────────
/** @type {readonly ComponentSpec[]} */
const COMPONENTS = [
  // ===== PRIMITIVES =====
  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/switch.tsx",
    section: "SwitchSection",
    partB: [
      "BUILD: §8.1 Switch (Toggle). Build from Base UI Switch (Switch.Root > Switch.Thumb).",
      'EXPORT: Switch — a thin controlled/uncontrolled wrapper: <Switch.Root className="sc-switch-root" {...props}><Switch.Thumb className="sc-switch-thumb"/></Switch.Root>. Pass through checked/defaultChecked/onCheckedChange/disabled. Also export SwitchSection.',
      "HOOK CLASSES (already in styles.css): sc-switch-root, sc-switch-thumb. Thumb travel is a calc() handled in CSS — do not set translate in JSX.",
      "STATE: data-checked / data-unchecked / data-disabled handled by the hook classes; in JSX you never write :checked.",
      'ACCESSIBLE NAME: when used as a labelled setting, wrap in Base UI Field.Label (import { Field } from "@base-ui/react/field") — no htmlFor/id.',
      "DEMO (SwitchSection): show three rows inside a Field.Label each — an on (defaultChecked), an off, and a disabled switch — each with a title (text-sm font-semibold text-foreground) + hint (text-xs text-muted-foreground), laid out flex items-center justify-between gap-3. Mirror the §8.1 snippet exactly.",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/menu.tsx",
    section: "MenuSection",
    partB: [
      'BUILD: §8.2 Menu / Popover. Build from Base UI Menu (import { Menu } from "@base-ui/react/menu").',
      'PART TREE: Menu.Root > Menu.Trigger > Menu.Portal(container=container) > Menu.Positioner (side/align/sideOffset) > Menu.Popup(data-slot="dropdown-menu-content") > Menu.Item / Menu.CheckboxItem / Menu.Separator / Menu.Group + Menu.GroupLabel.',
      "PORTAL: const container = usePortalContainer(); pass container to Menu.Portal (G5).",
      'POPUP STYLING is in CSS via data-slot="dropdown-menu-content" (transform-origin + enter/exit). Do NOT add popup colour/shadow utilities in JSX — just set data-slot on Menu.Popup.',
      'ITEMS are plain utilities + the highlighted: variant: className="rounded-md px-2.5 py-2 highlighted:bg-accent". Separator: className="my-1.5 h-px bg-border". GroupLabel: className="px-2.5 pt-1.5 pb-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground".',
      "STATE: trigger popupopen:; item highlighted:. Never :hover on items (G4).",
      "DEMO (MenuSection): a working Menu opened from an IconButton-style trigger (className=\"sc-icon-btn\") showing: an Attach file item, a Separator, a Group with GroupLabel 'Tools' and two Menu.CheckboxItem rows (use checked state via the checked: variant or a nested Switch). Follow the §8.2 snippet. Keep the trigger labelled with aria-label.",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/scroll-area.tsx",
    section: "ScrollAreaSection",
    partB: [
      'BUILD: §8.3 Scroll area. Build from Base UI ScrollArea (import { ScrollArea } from "@base-ui/react/scroll-area"). For BOUNDED panels only (not the chat log).',
      'PART TREE: ScrollArea.Root > ScrollArea.Viewport > ScrollArea.Scrollbar (orientation) > ScrollArea.Thumb. Put data-slot="scroll-area-scrollbar" on the Scrollbar and data-slot="scroll-area-thumb" on the Thumb (their overlay styling is already in CSS).',
      "EXPORT: ScrollArea — a wrapper that takes children + a className for the Viewport and renders the full part tree with a vertical Scrollbar. Also ScrollAreaSection.",
      "STATE: scrollbar data-hovering/data-scrolling/data-orientation drive the fade — handled in CSS; nothing in JSX.",
      "DEMO (ScrollAreaSection): a fixed-height box (e.g. h-48) wrapping ScrollArea around a tall column of ~20 muted text rows so the overlay scrollbar appears on hover/scroll. Give the Viewport rounded-lg border border-border.",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/row.tsx",
    section: "RowSection",
    partB: [
      "BUILD: §8.4 Row — the single most reused primitive: a selectable line [leading media?] [title + optional subtitle] [trailing check/indicator?]. Row is a className PATTERN, not its own Base UI part.",
      "EXPORT: RowSection only (consumers inline the pattern). You may also export a small `rowBaseClass` string constant if helpful.",
      "TWO FORMS to demonstrate: (A) as a Base UI item — state via highlighted:bg-(--row-bg-hover) (pointer OR keyboard) and selected: for the check; (B) as a standalone <button> conversation row — state via aria-current: hover:bg-(--row-bg-hover) + aria-[current=true]:bg-(--row-bg-active), trailing dot opacity-0 -> aria-[current=true]:opacity-100.",
      "TRUNCATION IS MANDATORY: title needs min-w-0 on the flex column AND truncate on the text, else the row widens the panel. Trailing indicator is always in the DOM at opacity-0, revealed by state (no reflow).",
      "DEMO (RowSection): render BOTH forms — a small Base UI Select or Menu with 3 item-rows (one selected, showing the check) AND a standalone list of 3 conversation <button> rows (one aria-current). Use leading sc-media on at least one. Follow the §8.4 snippets exactly (A and B).",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/media.tsx",
    section: "MediaSection",
    partB: [
      "BUILD: §8.5 Media (avatar). A fixed-size square leading graphic. Build from a plain span/img wrapper using the sc-media hook class (size + tokens already in CSS).",
      'EXPORT: Media — <span className={cn("sc-media", className)}>{children}</span> (centers a glyph or 1-2 initials; an <img> child fills via object-cover). Never set colour/size outside the hook class. Also MediaSection.',
      'DEMO (MediaSection): a row of several Media: one with initials, one with a lucide icon child, one with an <img className="size-full object-cover"> placeholder (use a data: or an inline svg, no external URL). Show they are all identical fixed squares.',
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/field.tsx",
    section: "FieldSection",
    partB: [
      'BUILD: §8.6 Text & form (Field). Build from Base UI Field (import { Field } from "@base-ui/react/field"). Carries label/hint type roles.',
      "PART TREE: Field.Root > Field.Label + Field.Description + Field.Control(render={<input/>} or render={<textarea/>}) + Field.Error.",
      "CONTROL classes: w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-md text-foreground outline-none + focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 + invalid:border-destructive. (focus-visible is allowed on the control element.) For textarea add resize-y.",
      "LABEL: text-sm font-semibold text-foreground. Description: text-xs text-muted-foreground. Error: text-xs text-destructive (note: NO text-destructive-foreground exists, §7.6).",
      "BEHAVIOR: clicking the Label focuses the Control automatically — never hand-write htmlFor/id. Validation via Field.Error + invalid: variant.",
      "DEMO (FieldSection): two fields — a single-line input ('Custom instructions' style) and a multi-line textarea (rows={4}) with a Description; plus one field shown in the invalid state (Field.Validity or by passing invalid) to demonstrate the destructive border + Field.Error text.",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/button.tsx",
    section: "ButtonSection",
    partB: [
      "BUILD: §8.7 Button. Text variants are pure tier-1 utilities on a plain <button> (hover: allowed). Icon button uses the sc-icon-btn hook class (size + popupopen reaction).",
      "EXPORTS: Button (variant: 'primary'|'secondary'|'ghost', default primary) and IconButton (icon-only, className sc-icon-btn, requires aria-label). Plus ButtonSection.",
      "VARIANT classes (all share: inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium + focus-visible:outline-2 focus-visible:outline-ring): primary = bg-primary text-primary-foreground; secondary = bg-secondary text-secondary-foreground border border-border hover:bg-accent; ghost = bg-transparent text-muted-foreground hover:bg-accent; outline = bg-card text-foreground border border-border hover:bg-accent.",
      'IconButton: <button className="sc-icon-btn" aria-label=...><Icon/></button>. It also reacts to popupopen: when used as a menu trigger (handled by the hook class).',
      "DEMO (ButtonSection): a row with primary, secondary, ghost buttons (each with an icon + label) and two IconButtons (e.g. Settings, Plus). Include a disabled primary.",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/segmented.tsx",
    section: "SegmentedSection",
    partB: [
      'BUILD: §8.8 Segmented (single-select Toggle Group). Build from Base UI ToggleGroup + Toggle (import { ToggleGroup } from "@base-ui/react/toggle-group"; import { Toggle } from "@base-ui/react/toggle"). value is a 1-ITEM ARRAY.',
      'EXPORT: Segmented — props { items: {id,label,Icon?}[], value: string, onValueChange: (v:string)=>void }. Render <ToggleGroup value={[value]} onValueChange={(v)=> v[0] && onValueChange(v[0])} className="sc-seg"> with Toggle children. Also SegmentedSection.',
      "TRACK = sc-seg hook class. ITEM classes: flex-1 flex items-center justify-center gap-1.5 rounded-sm px-1.5 py-1.5 text-xs font-medium text-muted-foreground cursor-pointer + pressed:bg-background pressed:text-foreground pressed:shadow-card. Active needs fill+shadow, not colour alone.",
      "STATE: active item via pressed: (never :hover). Exactly one active; items share width via flex-1.",
      "DEMO (SegmentedSection): a thinking-level switcher with 3 options (e.g. Off / Auto / Max, each with a lucide icon) wired to local useState, showing the active item filled. Follow the §8.8 snippet.",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/tabs.tsx",
    section: "TabsSection",
    partB: [
      'BUILD: §8.9 Tabs. Build from Base UI Tabs (import { Tabs } from "@base-ui/react/tabs"). Tabs owns PANELS (distinct from Segmented).',
      "PART TREE: Tabs.Root(value/onValueChange) > Tabs.List > Tabs.Tab x n; Tabs.Panel x n (siblings of List, same values). Drive BOTH from ONE array so adding a group appears in both.",
      "TAB classes: flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-sm text-muted-foreground cursor-pointer hover:bg-accent selected:bg-sidebar-accent selected:text-foreground. (hover: is acceptable here as it mirrors the contract snippet; active is selected:.)",
      "STATE: active tab via selected:.",
      "DEMO (TabsSection): a vertical Tabs.List (flex flex-col gap-1 w-44 shrink-0) of 3 groups (each with a lucide icon + label) beside their Tabs.Panel content (flex-1 min-w-0), from one GROUPS array. Follow the §8.9 snippet.",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/select.tsx",
    section: "SelectSection",
    partB: [
      'BUILD: §8.10 Select (non-searchable dropdown). Build from Base UI Select (import { Select } from "@base-ui/react/select").',
      'PART TREE: Select.Root(items/value/onValueChange) > Select.Trigger (Select.Value + Select.Icon) > Select.Portal(container=container) > Select.Positioner > Select.Popup(data-slot="select-content") > Select.List > Select.Item (Select.ItemText + Select.ItemIndicator).',
      'PORTAL: const container = usePortalContainer(); container on Select.Portal (G5). Popup styling is in CSS via data-slot="select-content".',
      'TRIGGER classes: a sc-icon-btn variant is fine, e.g. className="sc-icon-btn w-full justify-between px-3 rounded-xl border border-input". ITEM: flex items-center gap-2.5 px-2.5 py-2 rounded-md highlighted:bg-accent. ItemIndicator: ml-auto opacity-0 selected:opacity-100 text-primary.',
      "STATE: item highlighted: (active) + selected: (chosen -> check). Typeahead is built in.",
      "DEMO (SelectSection): a Default-model style Select over ~4 model objects {id,name}, wired to local useState, with the selected item's check shown. Follow the §8.10 snippet. (No search field — that would be a Combobox.)",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/combobox.tsx",
    section: "ComboboxSection",
    partB: [
      'BUILD: §8.11 Combobox (the SEARCHABLE selector — the only primitive with a filter input). Build from Base UI Combobox (import { Combobox } from "@base-ui/react/combobox"). Filtering, highlight, empty-state are built in.',
      'PART TREE: Combobox.Root(items/value/onValueChange) > Combobox.Trigger (Combobox.Value) > Combobox.Portal(container=container) > Combobox.Positioner > Combobox.Popup(data-slot="combobox-content") containing: a header div with a Search icon + Combobox.Input; Combobox.Empty (className sc-combo-empty); Combobox.List (max-h-64 overflow-auto p-1) > Combobox.Item (+ Combobox.ItemIndicator).',
      'PORTAL container=container (G5). Popup styling via data-slot="combobox-content" in CSS.',
      "INPUT: w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground. ITEM: flex items-center gap-2.5 px-2.5 py-2 rounded-md highlighted:bg-accent, with a leading sc-media glyph + a min-w-0 truncate title/desc column + ItemIndicator (ml-auto opacity-0 selected:opacity-100 text-primary).",
      "STATE: matched item highlighted:; chosen selected:. Use the built-in filter — no manual query state.",
      "DEMO (ComboboxSection): a searchable model selector over ~6 model objects {id,name,desc,icon}, reusing Row+Media patterns, with Combobox.Empty wired. Follow the §8.11 snippet.",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/badge.tsx",
    section: "BadgeSection",
    partB: [
      "BUILD: §8.12 Badge & Suggestion (plain markup, no Base UI). Badge = a NON-interactive <span> status pill. Suggestion = an interactive <button> (Row in pill form; hover: allowed).",
      "EXPORTS: Badge (non-interactive span) and Suggestion (button). Plus BadgeSection.",
      "Badge classes: inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground.",
      "Suggestion classes: inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent.",
      "IMPORTANT: a status pill must NOT be a button (no hover/focus affordance); a suggestion MUST be a real button (keyboard-focusable). Do not merge them.",
      "DEMO (BadgeSection): a row of Badges (e.g. Beta, with an icon variant) and a row of Suggestions (e.g. 'Summarize this page', 'Draft a reply') with leading icons.",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/tooltip.tsx",
    section: "TooltipSection",
    partB: [
      'BUILD: §8.13 Tooltip. Build from Base UI Tooltip (import { Tooltip } from "@base-ui/react/tooltip"). Replaces the native title attribute on header icon buttons.',
      'PART TREE: Tooltip.Provider (shared delay, near root) > Tooltip.Root > Tooltip.Trigger (render={<button className="sc-icon-btn" aria-label=.../>}) > Tooltip.Portal(container=container) > Tooltip.Positioner > Tooltip.Popup(data-slot="tooltip-content").',
      "PORTAL container=container (G5). Popup classes (Tooltip has no dedicated palette — inherit menu colours): rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground border border-border shadow-popover starting:opacity-0 ending:opacity-0.",
      "STATE: popup starting:/ending: for the fade.",
      "DEMO (TooltipSection): a Tooltip.Provider(delay=500) wrapping 3 IconButton triggers (Settings / New chat (Plus) / Close (X)) each with aria-label + a tooltip label. Follow the §8.13 snippet.",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/separator.tsx",
    section: "SeparatorSection",
    partB: [
      'BUILD: §8.14 Separator. Build from Base UI Separator (import { Separator } from "@base-ui/react/separator") — semantic role=separator, prefer over a styled <div>.',
      'USAGE: <Separator orientation="horizontal" className="my-1.5 h-px bg-border" />. No state.',
      'DEMO (SeparatorSection): show a horizontal separator between two stacked text blocks, and a vertical separator (orientation="vertical" className="mx-1.5 w-px self-stretch bg-border") between two inline items in a flex row.',
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ui/collapsible.tsx",
    section: "CollapsibleSection",
    partB: [
      'BUILD: §8.15 Collapsible. Build from Base UI Collapsible (import { Collapsible } from "@base-ui/react/collapsible"). Owns the open/close + height animation.',
      'PART TREE: Collapsible.Root(open/onOpenChange) > Collapsible.Trigger > Collapsible.Panel(className="sc-collapsible-panel"). Height animates from the CSS hook class reading --collapsible-panel-height — never a JS scrollHeight measure.',
      'TRIGGER: flex items-center gap-2 text-sm text-muted-foreground, with a chevron <ChevronDown className="transition-transform panelopen:rotate-180"/>.',
      "STATE: trigger panelopen: rotates the chevron. Controlled open is supported (so a parent can auto-collapse).",
      "DEMO (CollapsibleSection): a controlled Collapsible (local useState) with a Brain icon + label trigger and some panel content (a few rows). Follow the §8.15 snippet.",
    ].join("\n"),
  },

  {
    phase: "Primitives",
    file: "packages/side-chat-widget/src/shared/ai/markdown-content.tsx",
    section: "MarkdownSection",
    partB: [
      'BUILD: §10 Markdown wrapper. Do NOT parse Markdown yourself. Wrap Streamdown (import { Streamdown } from "streamdown").',
      "EXPORT: MarkdownContent — the ONE wrapper every assistant message renders through. Props (kit defaults; callers opt out, not in): children (the markdown string), mode?: 'streaming'|'static' (default 'static'; gates incomplete-stream repair). Wrap output in <div className=\"sc-markdown\">...<Streamdown>{children}</Streamdown></div> — the sc-markdown hook class already styles Streamdown's DOM (code/links/tables/lists/headings) via tokens. Keep dir=\"auto\". Do NOT add one-off colours.",
      "If Streamdown's exact prop names are uncertain, keep the wrapper minimal and resilient: pass the markdown as children and set the repair/parse-incomplete behaviour from `mode` only if the prop exists; otherwise just render children. The Section must render without throwing.",
      "DEMO (MarkdownSection): render MarkdownContent with a rich static markdown fixture string covering: a heading, a paragraph with a link and inline code, a bulleted list, a fenced code block (e.g. a small ts snippet), and a small table. Cap width with max-w-measure-message.",
    ].join("\n"),
  },

  // ===== COMPOSITIONS =====
  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/conversation-item.tsx",
    section: "ConversationItemSection",
    partB: [
      "BUILD: §9.1 Conversation item. The standalone <button> form of Row. No Base UI part.",
      'EXPORT: ConversationItem — props { title:string, when:string, active?:boolean, onSelect?:()=>void }. Render exactly the §9.1 snippet: <button aria-current={active || undefined} className="flex items-center gap-(--row-gap) w-full px-(--row-px) py-(--row-py) rounded-(--convo-item-radius) text-left hover:bg-(--convo-item-bg-hover) aria-[current=true]:bg-(--convo-item-bg-active)"> with a min-w-0 flex-col column (title: truncate text-sm font-medium text-(--convo-title-fg); subtitle/when: truncate text-xs text-(--convo-subtitle-fg)) and a trailing dot <span className="ml-auto size-1.5 rounded-full bg-(--convo-indicator) opacity-0 aria-[current=true]:opacity-100"/>. Also ConversationItemSection.',
      "BEHAVIOR: title truncates (min-w-0 truncate); active via aria-current (semantic, screen-reader announced) — never faked with a class alone; dot pre-rendered at opacity-0 so no reflow on selection.",
      "DEMO (ConversationItemSection): a narrow column (w-64) of ~4 ConversationItem with one active.",
    ].join("\n"),
  },

  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/conversation-grouping.tsx",
    section: "ConversationGroupingSection",
    partB: [
      'BUILD: §9.2 Conversation grouping. Conversation items (import { ConversationItem } from "#shared/ui/conversation-item") + an overline heading per bucket.',
      'EXPORT: ConversationGroupingSection (and optionally a ConversationGrouping component taking buckets). Bucket conversations by last-activity into Recent / This week / Older; OMIT empty buckets; newest-first within a bucket; gap between buckets via style={{ gap: "var(--rail-group-gap)" }} on a flex flex-col.',
      'OVERLINE classes: px-2.5 pt-1.5 pb-1 text-2xs font-bold uppercase tracking-wider text-muted-foreground. Each bucket is a <section className="flex flex-col gap-0.5">. Follow the §9.2 snippet.',
      "DEMO (ConversationGroupingSection): a w-64 rail-like column with mock conversations across Recent + Older (leave 'This week' empty to prove empty buckets are omitted), one item active.",
    ].join("\n"),
  },

  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/tools-menu.tsx",
    section: "ToolsMenuSection",
    partB: [
      'BUILD: §9.3 Tools menu. Menu (Base UI Menu + data-slot="dropdown-menu-content") + Switch (import { Switch } from "#shared/ui/switch") + Separator + Row patterns. NO new surface tokens.',
      'PART TREE: Menu.Root > Menu.Trigger (the + icon button; use className="sc-composer-add" so it rotates +->x on open, with a Plus icon) > Menu.Portal(container=container) > Menu.Positioner side="top" align="start" sideOffset={8} > Menu.Popup(data-slot="dropdown-menu-content") with: a Menu.Item \'Attach file\' (Paperclip), a Menu.Separator, a Menu.Group + Menu.GroupLabel \'Tools\' holding Menu.CheckboxItem rows that carry a Switch (tabIndex={-1}) for web-search/etc., then a GroupLabel \'Context scope\' with check (ItemIndicator) rows.',
      "PORTAL container=container (G5). Items highlighted:; checkbox checked:. One popover open at a time (Base UI).",
      "EXPORT: ToolsMenu (renders the whole menu, controlled by local state for the toggles) + ToolsMenuSection (mounts ToolsMenu with a hint to click the + ).",
    ].join("\n"),
  },

  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/model-selector.tsx",
    section: "ModelSelectorSection",
    partB: [
      'BUILD: §9.4 Model selector. Combobox (Base UI Combobox + data-slot="combobox-content") + Row + Media (import { Media } from "#shared/ui/media") + Segmented (import { Segmented } from "#shared/ui/segmented") for thinking level.',
      "It is a COMBOBOX (it filters), NOT a Select. Two INDEPENDENT selections share one popup: the model (Combobox) and the thinking level (a Segmented in the popup footer) — their state never mixes. The footer always echoes the live model + thinking.",
      'PART TREE: Combobox.Root > Combobox.Trigger (sc-icon-btn px-2 gap-1.5, shows current model name + a caret) > Portal(container=container) > Positioner side="top" align="end" sideOffset={8} > Popup(data-slot="combobox-content") with the search Input header, Combobox.Empty (sc-combo-empty), Combobox.List of model rows (Media + min-w-0 truncate name/desc + ItemIndicator selected:opacity-100), and a footer (border-t border-border p-2) holding <Segmented> for thinking.',
      "PORTAL container=container (G5). model rows highlighted:/selected:; thinking pressed:.",
      "EXPORT: ModelSelector (local state for model + thinking) + ModelSelectorSection.",
    ].join("\n"),
  },

  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/composer.tsx",
    section: "ComposerSection",
    partB: [
      'BUILD: §9.5 Composer. Field textarea + Tools menu (import { ToolsMenu } from "#shared/ui/tools-menu") + Model selector (import { ModelSelector } from "#shared/ui/model-selector") + a context ring + a send button.',
      'SHELL = sc-composer hook class (focus ring is on the SHELL via :focus-within, NOT the raw textarea). Structure (follow §9.5 snippet): a flex-col sc-composer containing a Field.Control render={<textarea rows={1}/>} (w-full resize-none bg-transparent px-3.5 py-3 text-md outline-none placeholder:text-muted-foreground) then a controls row (flex items-center gap-1.5 px-2 pb-2): <ToolsMenu/>, a context ring (a small inline <svg className="sc-context-ring"> with two circles: a .sc-context-ring-track and a .sc-context-ring-indicator; drive the indicator\'s strokeDashoffset from a pct via inline style — inline style for a runtime value is allowed), then ml-auto a flex with <ModelSelector/> and the send button.',
      'SEND is ONE button (never two) that swaps idle<->armed via your own data-armed state, using the sc-send hook class: <button className="sc-send" data-armed={armed || undefined}><ArrowUp/></button>. Enter sends / Shift+Enter newlines ONLY when send-on-enter is on (wire onKeyDown).',
      "EXPORT: Composer (local state: text, armed = text.length>0, a sendOnEnter bool, context pct) + ComposerSection. The context ring is decorative meta, not a control.",
    ].join("\n"),
  },

  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/message.tsx",
    section: "MessageSection",
    partB: [
      'BUILD: §9.6 Message. Text roles + (assistant) Markdown (import { MarkdownContent } from "#shared/ai/markdown-content"). No Base UI part — a semantic <div data-from>.',
      "EXPORT: Message — props { role:'user'|'assistant', text:string }. Follow the §9.6 snippet: outer <div data-from={role} className=\"data-[from=user]:flex data-[from=user]:justify-end\">. user branch = the bubble <div className=\"w-fit rounded-lg rounded-br-sm bg-message-user text-message-user-foreground px-3.5 py-2.5 text-md leading-message\" style={{ maxWidth: '82%' }}>{text}</div>. assistant branch = <div className=\"sc-markdown max-w-measure-message text-md\"><MarkdownContent>{text}</MarkdownContent></div>.",
      "IMPORTANT (G1): use leading-message (registered) and put the 82% cap in an inline style={{ maxWidth: '82%' }} (inline style is a runtime value, not a className, so it passes the gates). User bubble has ONE squared tail corner (rounded-lg + rounded-br-sm). The assistant has no bubble and caps at max-w-measure-message.",
      "DEMO (MessageSection): a short thread — a user message then an assistant message rendered through MarkdownContent (with a little markdown), then another user/assistant pair.",
    ].join("\n"),
  },

  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/message-actions.tsx",
    section: "MessageActionsSection",
    partB: [
      "BUILD: §9.7 Message actions. Ghost buttons under a COMPLETED answer. Uses the sc-action hook class (the data-copied success swap).",
      'EXPORT: MessageActions — props { onCopy?, onRetry? }. Render <div className="flex items-center gap-1"> with a Copy button <button className="sc-action" data-copied={copied||undefined}> that flips Copy<->\'Copied\' (with a Check icon) for ~1.3s on the SAME button via local state + setTimeout, and a Retry button <button className="sc-action"><RotateCcw/> Retry</button>. Follow the §9.7 snippet.',
      "'Copied' is a transient STATE on the same button, not a second button; the row only appears on finished answers.",
      "DEMO (MessageActionsSection): the actions row under a short mock assistant answer; clicking Copy shows the success swap.",
    ].join("\n"),
  },

  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/tool-row.tsx",
    section: "ToolRowSection",
    partB: [
      'BUILD: §9.9 Tool row. Badge (import { Badge } from "#shared/ui/badge") + a spinner. A compact line inside the Reasoning panel: tool name + status glyph.',
      "EXPORT: ToolRow — props { name:string, state:'running'|'success'|'error' }. data-state drives the glyph: running -> a spinning loader (a lucide Loader2 with animate-spin, or an inline spinner) ; success -> a Check (text-success) ; error -> a TriangleAlert (use the sc-error-glyph class for the destructive-into-muted tint). Compact row: flex items-center gap-2 text-sm text-muted-foreground, with a small Badge for the tool name surface. Also ToolRowSection.",
      "DEMO (ToolRowSection): three ToolRow stacked — one running, one success, one error.",
    ].join("\n"),
  },

  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/reasoning.tsx",
    section: "ReasoningSection",
    partB: [
      'BUILD: §9.8 Reasoning. Collapsible (Base UI Collapsible + sc-collapsible-panel) + Tool rows (import { ToolRow } from "#shared/ui/tool-row").',
      "KEY: thoughts and tool rows are SIBLINGS INSIDE the Collapsible.Panel, interleaved in STREAM ORDER — never a separate block below the answer. Header label can shimmer while thinking (a subtle pulse class is fine). Auto-collapse by flipping the controlled open to false when the answer begins, but it STAYS user-toggleable. Panel height animates via --collapsible-panel-height (the hook class) — no JS measure.",
      "TRIGGER: flex items-center gap-2 text-sm text-muted-foreground with a Brain icon, a label ('Thought for 4s'), and a ChevronDown with panelopen:rotate-180. Panel content: a vertical list interleaving thought lines (text-sm text-muted-foreground) and <ToolRow> entries.",
      "EXPORT: Reasoning (controlled open state, a list of interleaved thought/tool items) + ReasoningSection (show it expanded with 2 thoughts + 2 tool rows interleaved, and a toggle).",
    ].join("\n"),
  },

  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/error-notice.tsx",
    section: "ErrorNoticeSection",
    partB: [
      "BUILD: §9.10 Error. A secondary Button (Try again) on a MUTED surface — not a full-red panel. Uses the sc-error-glyph hook class (destructive mixed into muted; there is NO text-destructive-foreground, §7.6).",
      'EXPORT: ErrorNotice — props { message?:string, onRetry?:()=>void }. Follow the §9.10 snippet: <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3"> with <TriangleAlert className="sc-error-glyph"/>, a min-w-0 column (p text-sm text-foreground message), and a shared secondary Button <Button variant="secondary" size="sm" className="mt-2"> that re-runs the same turn. Also ErrorNoticeSection.',
      "Tint the glyph ONLY via sc-error-glyph (color-mix in CSS) — do not invent text-destructive-foreground. Body copy uses text-foreground/text-muted-foreground.",
      "DEMO (ErrorNoticeSection): one ErrorNotice with a realistic message + a working Try again (local state toast/log).",
    ].join("\n"),
  },

  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/settings.tsx",
    section: "SettingsSection",
    partB: [
      "BUILD: §9.11 Settings (responsive). Tabs<->Select on ONE group state + Field + Switch + Segmented + ScrollArea. Import primitives: Switch from #shared/ui/switch, Segmented from #shared/ui/segmented, ScrollArea from #shared/ui/scroll-area; use Base UI Tabs/Select/Field directly.",
      "Tabs.Root stays mounted in BOTH layouts; WIDE renders Tabs.List as a left rail (flex flex-col gap-1 w-44 shrink-0; tab classes ... selected:bg-sidebar-accent selected:text-foreground); NARROW swaps the List for a Select bound to the SAME value. Tabs.Panel per group identical in both. ONE GROUPS array drives both navigators -> content never forks.",
      'GROUPS: Theme (swatch cards — render cards using data-sidechat-theme-preview="graphite|sage|ocean" wrappers so each previews its palette in isolation) and General (a Custom-instructions Field textarea, a Send-on-Enter Switch row, a Default-model Select). The settings body scrolls via ScrollArea.',
      "EXPORT: SettingsPanel (takes a `wide` boolean or reads a local toggle) + SettingsSection. In the Section, render the WIDE layout and also expose a small toggle to preview the NARROW (Select nav) layout, demonstrating both navigate the same panels.",
    ].join("\n"),
  },

  {
    phase: "Compositions",
    file: "packages/side-chat-widget/src/shared/ui/shell.tsx",
    section: "ShellSection",
    partB: [
      'BUILD: §9.12 Shell · Rail · Header (the alignment contract). Composes the kit. Hook classes (already in CSS): sc-panel, sc-header, sc-rail, sc-rail-newchat. Chat log = NATIVE stick-to-bottom scrolling (overflow-y-auto), NEVER a ScrollArea (§7.8). The rail uses ScrollArea (import { ScrollArea } from "#shared/ui/scroll-area").',
      "ALIGNMENT CONTRACT (4 rules): (1) both columns reserve one --header-h top band — the rail New-chat zone (sc-rail-newchat, height --rail-newchat-h) EQUALS the header (sc-header, height --header-h) so 'New chat' and the header title sit on the same Y. (2) the divider is continuous at y=--header-h across both columns. (3) the rail has no header of its own; below the breakpoint the rail hides and the header's conversation Menu switcher returns. (4) the panel anchors bottom-right (sc-panel), clipped by rounded-xl, max size viewport-32px, never full-bleed.",
      'STRUCTURE: an sc-panel containing a flex row of [sc-rail with sc-rail-newchat alignment zone containing the shared <Button variant="secondary">New chat</Button> + a ScrollArea of ConversationGrouping below] and [a flex-col main: sc-header (title left, IconButtons right: New chat / Settings / Close) + a native-scroll chat log (flex-1 overflow-y-auto) of Messages + a Composer at the bottom]. Reuse: import { ConversationGrouping or ConversationGroupingSection } not needed — you may import ConversationItem from #shared/ui/conversation-item, Message from #shared/ui/message, Composer from #shared/ui/composer, Button and IconButton from #shared/ui/button.',
      "EXPORT: Shell (the assembled panel, mostly static mock content) + ShellSection. Give the panel a bounded demo frame (e.g. a relative container with a fixed height like h-[640px] is BANNED arbitrary — instead use a sized wrapper with style={{height:'640px'}} inline, which is allowed as a runtime/demo value) so the absolute sc-panel has a positioning context. The Section renders the full assembled widget shell once.",
    ].join("\n"),
  },
];

// ───────────────────────── Run ─────────────────────────
/**
 * @param {ComponentSpec} component
 */
function buildPrompt(component) {
  return [
    PREAMBLE,
    "",
    ROSTER,
    "",
    "=========== YOUR FILE ===========",
    "FILE: " + component.file,
    "REQUIRED section export: " + component.section,
    "",
    component.partB,
    "",
    "Build it now: read src/shared/ui/widget-root.tsx and src/shared/lib/cn.ts if useful, write the file, run the gate greps on it, fix, then return the manifest.",
  ].join("\n");
}

/**
 * @param {BuildManifest | null} result
 * @returns {result is BuildManifest}
 */
function hasManifest(result) {
  return result !== null;
}

const primitives = COMPONENTS.filter((c) => c.phase === "Primitives");
const compositions = COMPONENTS.filter((c) => c.phase === "Compositions");

runPhase("Primitives");
runLog("Building " + primitives.length + " primitives (§8 + §10 markdown)…");
const primitiveResults = await runParallel(
  primitives.map(
    (component) => () =>
      runAgent(buildPrompt(component), {
        label: component.file.split("/").pop(),
        phase: "Primitives",
        schema: MANIFEST_SCHEMA,
      }),
  ),
);

runPhase("Compositions");
runLog("Building " + compositions.length + " compositions (§9)…");
const compositionResults = await runParallel(
  compositions.map(
    (component) => () =>
      runAgent(buildPrompt(component), {
        label: component.file.split("/").pop(),
        phase: "Compositions",
        schema: MANIFEST_SCHEMA,
      }),
  ),
);

const manifest = [...primitiveResults, ...compositionResults]
  .filter(hasManifest)
  .map((item, index) => ({
    kind: index < primitiveResults.length ? "primitive" : "composition",
    ...item,
  }));

runLog("Built " + manifest.length + "/" + COMPONENTS.length + " component files.");
return {
  manifest,
  expected: COMPONENTS.map((component) => ({
    file: component.file,
    section: component.section,
    phase: component.phase,
  })),
};
