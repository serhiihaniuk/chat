/**
 * Model selector demo — renders the REAL <ModelSelector> the same way its in-source
 * `ModelSelectorSection` does: a `models` list plus a default model + thinking level.
 *
 * It lives inside <Preview>'s shadow root (styled only by the widget's compiled CSS),
 * so this wrapper's own layout/labels use inline styles + widget tokens, and the
 * lucide glyphs passed as `Model.icon` use the `size` prop (never Tailwind classes).
 * The selector owns its open/close + selection state internally; the controlled
 * callbacks here just mirror the current choice into a caption so the card reads live.
 */
import { useState, type ReactElement } from "react";
import { Brain, Globe, Sparkles, Wrench } from "lucide-react";

import { ModelSelector, type Model } from "@side-chat/side-chat-widget/ui/model-selector";

const MODELS: readonly Model[] = [
  {
    id: "sonnet",
    name: "Claude Sonnet",
    desc: "Balanced — everyday tasks",
    icon: <Sparkles size={16} />,
  },
  {
    id: "opus",
    name: "Claude Opus",
    desc: "Deepest reasoning, slower",
    icon: <Brain size={16} />,
  },
  {
    id: "haiku",
    name: "Claude Haiku",
    desc: "Fastest, lightweight",
    icon: <Sparkles size={16} />,
  },
  {
    id: "tools",
    name: "Agent (tools)",
    desc: "Calls tools and APIs",
    icon: <Wrench size={16} />,
  },
  {
    id: "web",
    name: "Web-grounded",
    desc: "Answers with live search",
    icon: <Globe size={16} />,
  },
];

export function ModelSelectorDemo(): ReactElement {
  const [modelId, setModelId] = useState("opus");
  const [thinking, setThinking] = useState("medium");

  const modelName = MODELS.find((m) => m.id === modelId)?.name ?? "no model";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        maxWidth: "26rem",
      }}
    >
      <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
        Mirrors the composer footer — the trigger shows the model and thinking level; the
        popup carries search, the model list, the thinking segmented control, and a status
        line. Open it to pick a model.
      </span>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "0.5rem 0.75rem",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--border)",
          background: "var(--background)",
        }}
      >
        <ModelSelector
          models={MODELS}
          value={modelId}
          onValueChange={setModelId}
          thinkingValue={thinking}
          onThinkingChange={setThinking}
        />
      </div>
      <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
        Sending with <code>{modelName}</code> · <code>{thinking}</code> thinking
      </span>
    </div>
  );
}
