/**
 * Showcase manifest for the component demo page.
 *
 * Keep this order aligned with the component sections in design_widget.html:
 * primitives first, then assembled chat surfaces, then late reference/demo-only
 * primitives that appear near the end of the design file.
 */
import type { ReactNode } from "react";

import { MarkdownSection } from "#shared/ai/markdown-content";
import { BadgeSection } from "#shared/ui/badge";
import { ButtonSection } from "#shared/ui/button";
import { CollapsibleSection } from "#shared/ui/collapsible";
import { ComboboxSection } from "#shared/ui/combobox";
import { ComposerSection } from "#shared/ui/composer";
import { ConversationGroupingSection } from "#shared/ui/conversation-grouping";
import { ConversationItemSection } from "#shared/ui/conversation-item";
import { ErrorNoticeSection } from "#shared/ui/error-notice";
import { FieldSection } from "#shared/ui/field";
import { MediaSection } from "#shared/ui/media";
import { MenuSection } from "#shared/ui/menu";
import { MessageSection } from "#shared/ui/message";
import { MessageActionsSection } from "#shared/ui/message-actions";
import { ModelSelectorSection } from "#shared/ui/model-selector";
import { ReasoningSection } from "#shared/ui/reasoning";
import { RowSection } from "#shared/ui/row";
import { ScrollAreaSection } from "#shared/ui/scroll-area";
import { SegmentedSection } from "#shared/ui/segmented";
import { SelectSection } from "#shared/ui/select";
import { SeparatorSection } from "#shared/ui/separator";
import { SettingsSection } from "#shared/ui/settings";
import { ShellSection } from "#shared/ui/shell";
import { SwitchSection } from "#shared/ui/switch";
import { TabsSection } from "#shared/ui/tabs";
import { ToolRowSection } from "#shared/ui/tool-row";
import { ToolsMenuSection } from "#shared/ui/tools-menu";
import { TooltipSection } from "#shared/ui/tooltip";

export type ShowcaseSection = {
  readonly id: string;
  readonly title: string;
  readonly kind: "primitive" | "composition";
  readonly node: ReactNode;
};

export const sections: readonly ShowcaseSection[] = [
  { id: "row", title: "Section 8.4 - Row", kind: "primitive", node: <RowSection /> },
  { id: "media", title: "Section 8.5 - Media (avatar)", kind: "primitive", node: <MediaSection /> },
  {
    id: "field",
    title: "Section 8.6 - Field (text & form)",
    kind: "primitive",
    node: <FieldSection />,
  },
  { id: "button", title: "Section 8.7 - Button", kind: "primitive", node: <ButtonSection /> },
  { id: "switch", title: "Section 8.1 - Switch", kind: "primitive", node: <SwitchSection /> },
  {
    id: "segmented",
    title: "Section 8.8 - Segmented",
    kind: "primitive",
    node: <SegmentedSection />,
  },
  { id: "tabs", title: "Section 8.9 - Tabs", kind: "primitive", node: <TabsSection /> },
  { id: "menu", title: "Section 8.2 - Menu / Popover", kind: "primitive", node: <MenuSection /> },
  {
    id: "badge",
    title: "Section 8.12 - Badge & Suggestion",
    kind: "primitive",
    node: <BadgeSection />,
  },
  {
    id: "scroll-area",
    title: "Section 8.3 - Scroll area",
    kind: "primitive",
    node: <ScrollAreaSection />,
  },

  {
    id: "shell",
    title: "Section 9.12 - Shell / Rail / Header",
    kind: "composition",
    node: <ShellSection />,
  },
  {
    id: "conversation-item",
    title: "Section 9.1 - Conversation item",
    kind: "composition",
    node: <ConversationItemSection />,
  },
  {
    id: "conversation-grouping",
    title: "Section 9.2 - Conversation grouping",
    kind: "composition",
    node: <ConversationGroupingSection />,
  },
  { id: "message", title: "Section 9.6 - Message", kind: "composition", node: <MessageSection /> },
  {
    id: "message-actions",
    title: "Section 9.7 - Message actions",
    kind: "composition",
    node: <MessageActionsSection />,
  },
  {
    id: "composer",
    title: "Section 9.5 - Composer",
    kind: "composition",
    node: <ComposerSection />,
  },
  {
    id: "tools-menu",
    title: "Section 9.3 - Tools menu",
    kind: "composition",
    node: <ToolsMenuSection />,
  },
  {
    id: "model-selector",
    title: "Section 9.4 - Model selector",
    kind: "composition",
    node: <ModelSelectorSection />,
  },
  {
    id: "reasoning",
    title: "Section 9.8 - Reasoning",
    kind: "composition",
    node: <ReasoningSection />,
  },
  {
    id: "tool-row",
    title: "Section 9.9 - Tool row",
    kind: "composition",
    node: <ToolRowSection />,
  },
  {
    id: "error-notice",
    title: "Section 9.10 - Error",
    kind: "composition",
    node: <ErrorNoticeSection />,
  },
  {
    id: "settings",
    title: "Section 9.11 - Settings (responsive)",
    kind: "composition",
    node: <SettingsSection />,
  },

  { id: "select", title: "Section 8.10 - Select", kind: "primitive", node: <SelectSection /> },
  {
    id: "combobox",
    title: "Section 8.11 - Combobox",
    kind: "primitive",
    node: <ComboboxSection />,
  },
  { id: "tooltip", title: "Section 8.13 - Tooltip", kind: "primitive", node: <TooltipSection /> },
  {
    id: "separator",
    title: "Section 8.14 - Separator",
    kind: "primitive",
    node: <SeparatorSection />,
  },
  {
    id: "collapsible",
    title: "Section 8.15 - Collapsible",
    kind: "primitive",
    node: <CollapsibleSection />,
  },
  {
    id: "markdown",
    title: "Section 10 - Markdown / Streamdown",
    kind: "primitive",
    node: <MarkdownSection />,
  },
];
