import { useState, type ReactElement } from "react";

import { Brain, Sparkles } from "lucide-react";

import {
  ModelSelector,
  type Model,
} from "@side-chat/side-chat-widget/ui/model-selector";
import {
  ToolsMenu,
  type ToolMenuItem,
} from "@side-chat/side-chat-widget/ui/tools-menu";

const PREVIEW_MODELS: readonly Model[] = [
  {
    desc: "Balanced everyday tasks",
    icon: <Sparkles className="size-4" />,
    id: "sonnet",
    name: "Claude Sonnet",
  },
  {
    desc: "Deepest reasoning, slower",
    icon: <Brain className="size-4" />,
    id: "opus",
    name: "Claude Opus",
  },
];

const INITIAL_PREVIEW_TOOLS: readonly ToolMenuItem[] = [
  { enabled: true, label: "Web search", name: "web-search" },
  { enabled: false, label: "Code tools", name: "code-tools" },
];

export function PreviewModelSelector(): ReactElement {
  return <ModelSelector models={PREVIEW_MODELS} />;
}

export function PreviewToolsMenu(): ReactElement {
  const [tools, setTools] = useState(INITIAL_PREVIEW_TOOLS);
  const toggleTool = (name: string): void => {
    setTools((current) =>
      current.map((tool) =>
        tool.name === name ? { ...tool, enabled: !tool.enabled } : tool,
      ),
    );
  };

  return <ToolsMenu onToggleTool={toggleTool} tools={tools} />;
}
