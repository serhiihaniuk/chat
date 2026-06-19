/**
 * Section 9.5 - Composer.
 *
 * The input shell: a Field textarea over a controls row (Tools menu + decorative
 * context ring + Model selector slot + send). The focus ring lives on the shell
 * via `sc-composer` (`:focus-within`), never on the raw textarea, so tabbing into
 * the field lights the whole surface. Send is one button that swaps idle/armed/stop
 * through our own `data-armed` state on the `sc-send` hook class.
 */
import { useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";

import { Field } from "@base-ui/react/field";
import { ArrowUp, Brain, Sparkles, Square } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { ModelSelector, type Model } from "#shared/ui/model-selector";
import { ToolsMenu } from "#shared/ui/tools-menu";

export type ComposerStatus = "idle" | "submitted" | "streaming" | "error";

export type ComposerProps = {
  readonly className?: string;
  readonly contextPercent?: number;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly modelSelector?: ReactNode;
  readonly onStop?: () => void;
  readonly onSubmit?: (messageText: string) => Promise<void> | void;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly sendLabel?: string;
  readonly sendOnEnter?: boolean;
  readonly status?: ComposerStatus;
  readonly value?: string;
};

/** Sample models for the self-contained demo. Live callers pass `modelSelector`. */
const MODELS: readonly Model[] = [
  {
    id: "sonnet",
    name: "Claude Sonnet",
    desc: "Balanced - everyday tasks",
    icon: <Sparkles className="size-4" />,
  },
  {
    id: "opus",
    name: "Claude Opus",
    desc: "Deepest reasoning, slower",
    icon: <Brain className="size-4" />,
  },
];

const RING_R = 6.5;
const RING_C = 2 * Math.PI * RING_R;

export function ContextRing({ pct }: { readonly pct: number }): ReactElement {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg
      aria-hidden
      className="sc-context-ring shrink-0"
      fill="none"
      height={18}
      viewBox="0 0 18 18"
      width={18}
    >
      <circle className="sc-context-ring-track" cx={9} cy={9} r={RING_R} strokeWidth={2.4} />
      <circle
        className="sc-context-ring-indicator"
        cx={9}
        cy={9}
        r={RING_R}
        strokeDasharray={RING_C}
        strokeLinecap="round"
        strokeWidth={2.4}
        style={{ strokeDashoffset: RING_C * (1 - clamped / 100) }}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

export function Composer({
  className,
  contextPercent = 42,
  defaultValue = "",
  disabled = false,
  modelSelector,
  onStop,
  onSubmit,
  onValueChange,
  placeholder = "Message...",
  sendLabel = "Send message",
  sendOnEnter = true,
  status = "idle",
  value,
}: ComposerProps): ReactElement {
  const { setText, text } = useComposerText({ defaultValue, onValueChange, value });
  const isBusy = isBusyStatus(status);
  const canSend = canSubmitText(text, disabled, isBusy);
  const selector = resolveModelSelector(modelSelector);
  const send = (): void => submitComposerText({ canSend, isBusy, onStop, onSubmit, setText, text });
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void =>
    submitOnEnter({ event, send, sendOnEnter });

  return (
    <Field.Root className={cn("sc-composer", className)}>
      <Field.Control
        aria-label="Message"
        className="w-full resize-none bg-transparent px-3.5 py-3 text-md outline-none placeholder:text-muted-foreground"
        disabled={disabled || isBusy}
        onChange={(event) => setText(event.target.value)}
        onInput={(event) => setText(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        render={<textarea rows={3} />}
        value={text}
      />
      <div className="flex items-center gap-1.5 px-2 pb-2">
        <ToolsMenu />
        <ContextRing pct={contextPercent} />
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          {selector}
          <button
            aria-label={sendLabel}
            className="sc-send"
            data-armed={canSend || isBusy ? true : undefined}
            onClick={send}
            type="button"
          >
            {isBusy ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </div>
    </Field.Root>
  );
}

const useComposerText = ({
  defaultValue,
  onValueChange,
  value,
}: {
  readonly defaultValue: string;
  readonly onValueChange: ((value: string) => void) | undefined;
  readonly value: string | undefined;
}): {
  readonly setText: (value: string) => void;
  readonly text: string;
} => {
  const [localText, setLocalText] = useState(defaultValue);
  const text = value ?? localText;

  const setText = (nextText: string): void => {
    if (value === undefined) setLocalText(nextText);
    onValueChange?.(nextText);
  };

  return { setText, text };
};

const isBusyStatus = (status: ComposerStatus): boolean =>
  status === "submitted" || status === "streaming";

const canSubmitText = (text: string, disabled: boolean, isBusy: boolean): boolean =>
  text.trim().length > 0 && !disabled && !isBusy;

const resolveModelSelector = (modelSelector: ReactNode | undefined): ReactNode =>
  modelSelector === undefined ? <ModelSelector models={MODELS} /> : modelSelector;

const submitComposerText = ({
  canSend,
  isBusy,
  onStop,
  onSubmit,
  setText,
  text,
}: {
  readonly canSend: boolean;
  readonly isBusy: boolean;
  readonly onStop: (() => void) | undefined;
  readonly onSubmit: ((messageText: string) => Promise<void> | void) | undefined;
  readonly setText: (value: string) => void;
  readonly text: string;
}): void => {
  if (isBusy) {
    onStop?.();
    return;
  }

  if (!canSend) return;
  void onSubmit?.(text.trim());
  setText("");
};

const submitOnEnter = ({
  event,
  send,
  sendOnEnter,
}: {
  readonly event: KeyboardEvent<HTMLInputElement>;
  readonly send: () => void;
  readonly sendOnEnter: boolean;
}): void => {
  if (event.key !== "Enter" || event.shiftKey || !sendOnEnter) return;
  event.preventDefault();
  send();
};

export function ComposerSection(): ReactElement {
  const [armedText, setArmedText] = useState("Summarise the attached spec");

  return (
    <div className="flex w-full max-w-measure-message flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Idle</span>
        <Composer />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Armed</span>
        <Composer
          contextPercent={78}
          onSubmit={() => setArmedText("")}
          onValueChange={setArmedText}
          value={armedText}
        />
      </div>
    </div>
  );
}
