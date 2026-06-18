/**
 * §9.5 — Composer.
 *
 * The input shell: a Field textarea over a controls row (Tools menu + decorative
 * context ring + Model selector + send). The focus ring lives on the SHELL via
 * `sc-composer` (`:focus-within`), never on the raw textarea — so tabbing into the
 * field lights the whole surface. Send is ONE button that swaps idle ↔ armed through
 * our own `data-armed` state on the `sc-send` hook class; there are never two buttons.
 * Enter sends / Shift+Enter newlines only while send-on-enter is on. The context %
 * ring is decorative meta (`sc-context-ring`, SVG stroke driven by `strokeDashoffset`
 * from a runtime %), not a control — so it is `aria-hidden` and not focusable.
 */
import { useState, type ReactElement } from "react";

import { Field } from "@base-ui/react/field";
import { ArrowUp, Brain, Sparkles } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { ModelSelector, type Model } from "#shared/ui/model-selector";
import { ToolsMenu } from "#shared/ui/tools-menu";

/** Sample models for the self-contained demo (the selector is prop-driven). */
const MODELS: readonly Model[] = [
  {
    id: "sonnet",
    name: "Claude Sonnet",
    desc: "Balanced — everyday tasks",
    icon: <Sparkles className="size-4" />,
  },
  {
    id: "opus",
    name: "Claude Opus",
    desc: "Deepest reasoning, slower",
    icon: <Brain className="size-4" />,
  },
];

/** Geometry for the decorative ring (matches the design: 18px box, r 6.5, stroke 2.4). */
const RING_R = 6.5;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Decorative context-usage ring. `pct` (0–100) drives the indicator's
 * `strokeDashoffset` inline (a runtime value, allowed). Rotated -90° so the arc
 * fills clockwise from 12 o'clock. Small and grey (track = border, indicator =
 * muted-foreground) so it reads as subtle meta, not a spinner. Not a control:
 * `aria-hidden`, no tab stop. Size set via SVG attributes (not a utility) to hit
 * the design's exact 18px without an arbitrary class value.
 */
function ContextRing({ pct }: { pct: number }): ReactElement {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg
      className="sc-context-ring shrink-0"
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
    >
      <circle
        className="sc-context-ring-track"
        cx={9}
        cy={9}
        r={RING_R}
        strokeWidth={2.4}
      />
      <circle
        className="sc-context-ring-indicator"
        cx={9}
        cy={9}
        r={RING_R}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeDasharray={RING_C}
        transform="rotate(-90 9 9)"
        style={{ strokeDashoffset: RING_C * (1 - clamped / 100) }}
      />
    </svg>
  );
}

export function Composer({
  className,
  placeholder = "Message…",
}: {
  className?: string;
  placeholder?: string;
}): ReactElement {
  const [text, setText] = useState("");
  const [sendOnEnter, setSendOnEnter] = useState(true);
  // Decorative meta — a fixed sample fill for the static demo.
  const [pct] = useState(42);

  const armed = text.length > 0;

  const send = (): void => {
    if (!armed) return;
    setText("");
  };

  return (
    <Field.Root className={cn("sc-composer", className)}>
      <Field.Control
        render={<textarea rows={1} />}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-3.5 py-3 text-md outline-none placeholder:text-muted-foreground"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && sendOnEnter) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="flex items-center gap-1.5 px-2 pb-2">
        <ToolsMenu />
        <ContextRing pct={pct} />
        <div className="ml-auto flex items-center gap-1.5">
          <ModelSelector models={MODELS} />
          <button
            type="button"
            className="sc-send"
            data-armed={armed || undefined}
            aria-label="Send message"
            onClick={send}
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
      {/* send-on-enter is owned here; kept off-canvas-simple for the demo */}
      <span className="sr-only" aria-hidden>
        {sendOnEnter ? "enter-sends" : "enter-newlines"}
      </span>
    </Field.Root>
  );
}

export function ComposerSection(): ReactElement {
  // Two static instances so both send states read 1:1 in the showcase.
  const [armedText, setArmedText] = useState("Summarise the attached spec");
  const [sendOnEnter, setSendOnEnter] = useState(true);

  return (
    <div className="flex w-full max-w-measure-message flex-col gap-6">
      {/* Idle — empty textarea, send is muted (data-armed unset) */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Idle</span>
        <Composer />
      </div>

      {/* Armed — textarea has content, send is primary (data-armed set), ring fuller */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Armed</span>
        <Field.Root className="sc-composer">
          <Field.Control
            render={<textarea rows={1} />}
            value={armedText}
            onChange={(e) => setArmedText(e.target.value)}
            placeholder="Message…"
            className="w-full resize-none bg-transparent px-3.5 py-3 text-md outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && sendOnEnter) {
                e.preventDefault();
                setArmedText("");
              }
            }}
          />
          <div className="flex items-center gap-1.5 px-2 pb-2">
            <ToolsMenu />
            <ContextRing pct={78} />
            <div className="ml-auto flex items-center gap-1.5">
              <ModelSelector models={MODELS} />
              <button
                type="button"
                className="sc-send"
                data-armed={armedText.length > 0 || undefined}
                aria-label="Send message"
                onClick={() => setArmedText("")}
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
          </div>
        </Field.Root>
        {/* send-on-enter toggle stub so the bool is exercised in the demo */}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={sendOnEnter}
            onChange={(e) => setSendOnEnter(e.target.checked)}
          />
          Send on Enter (Shift+Enter for newline)
        </label>
      </div>
    </div>
  );
}
