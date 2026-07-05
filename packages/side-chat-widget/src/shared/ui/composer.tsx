/**
 * Section 9.5 - Composer.
 *
 * The input shell: a Field textarea over a controls row (Tools menu + honest
 * context meter + Model selector slot + send). The focus ring lives on the shell
 * via `sc-composer` (`:focus-within`), never on the raw textarea, so tabbing into
 * the field lights the whole surface. Send is one button that swaps idle/armed/stop
 * through our own `data-armed` state on the `sc-send` hook class.
 *
 * The field stays enabled while a turn streams so the next message can be drafted;
 * a bare Enter then inserts a newline (Stop is the button's job, not Enter's), and
 * focus returns to the field after each send and when the turn finishes.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { Field } from "@base-ui/react/field";
import { ArrowUp, Brain, Sparkles, Square } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { useWidgetLabels } from "#shared/lib/widget-labels";
import { ContextMeter } from "#shared/ui/context-meter";
import { ModelSelector, type Model } from "#shared/ui/model-selector";
import { ToolsMenu } from "#shared/ui/tools-menu";

export type ComposerStatus = "idle" | "submitted" | "streaming" | "error";

export type ComposerProps = {
  readonly className?: string;
  readonly contextUsedTokens?: number | undefined;
  readonly contextWindowTokens?: number | undefined;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly modelSelector?: ReactNode;
  readonly toolsMenu?: ReactNode;
  readonly onStop?: () => void;
  readonly onSubmit?: (messageText: string) => Promise<void> | void;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly sendLabel?: string;
  // When true (default) Enter sends and Shift+Enter inserts a newline; when false
  // (the "Send with Ctrl+Enter" preference) Ctrl/Cmd+Enter sends and Enter is a newline.
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

export function Composer({
  className,
  contextUsedTokens,
  contextWindowTokens,
  defaultValue = "",
  disabled = false,
  modelSelector,
  toolsMenu,
  onStop,
  onSubmit,
  onValueChange,
  placeholder = "Message...",
  sendLabel = "Send message",
  sendOnEnter = true,
  status = "idle",
  value,
}: ComposerProps): ReactElement {
  const labels = useWidgetLabels();
  const { setText, text } = useComposerText({ defaultValue, onValueChange, value });
  const isBusy = isBusyStatus(status);
  const canSend = canSubmitText(text, disabled, isBusy);
  const selector = resolveModelSelector(modelSelector);
  const tools = resolveToolsMenu(toolsMenu);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useRefocusOnIdle(isBusy, textareaRef);
  const send = (): void => {
    submitComposerText({ canSend, isBusy, onStop, onSubmit, setText, text });
    // A pointer submit moves focus to the send button; pull it back so the field is
    // ready for the next message (the field stays mounted+enabled through streaming).
    textareaRef.current?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void =>
    submitOnEnter({ event, isBusy, send, sendOnEnter });

  return (
    <Field.Root className={cn("sc-composer", className)}>
      <Field.Control
        aria-label={labels.composerInputAria}
        className="w-full resize-none bg-transparent px-3.5 py-3 text-md outline-none placeholder:text-muted-foreground"
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onInput={(event) => setText(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        render={<textarea ref={textareaRef} rows={3} />}
        value={text}
      />
      <div className="flex items-center gap-1.5 px-2 pb-2">
        {tools}
        <ContextMeter usedTokens={contextUsedTokens} windowTokens={contextWindowTokens} />
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

// When a turn finishes (busy -> idle) return focus to the field so the user can keep
// typing without reaching for the mouse. A ref tracks the previous busy state so it
// fires only on the falling edge, never on mount.
const useRefocusOnIdle = (
  isBusy: boolean,
  textareaRef: { readonly current: HTMLTextAreaElement | null },
): void => {
  const wasBusyRef = useRef(isBusy);
  useEffect(() => {
    if (wasBusyRef.current && !isBusy) textareaRef.current?.focus();
    wasBusyRef.current = isBusy;
  }, [isBusy, textareaRef]);
};

const isBusyStatus = (status: ComposerStatus): boolean =>
  status === "submitted" || status === "streaming";

const canSubmitText = (text: string, disabled: boolean, isBusy: boolean): boolean =>
  text.trim().length > 0 && !disabled && !isBusy;

const resolveModelSelector = (modelSelector: ReactNode | undefined): ReactNode =>
  modelSelector === undefined ? <ModelSelector models={MODELS} /> : modelSelector;

const resolveToolsMenu = (toolsMenu: ReactNode | undefined): ReactNode =>
  toolsMenu === undefined ? <ToolsMenu /> : toolsMenu;

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

// The subset of a keyboard event the Enter policy reads. A React
// KeyboardEvent satisfies it structurally, and a test can build one by hand —
// which matters because React's delegated onKeyDown can't be driven from a
// synthetic dispatch under the node test harness.
export type ComposerEnterEvent = {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly keyCode: number;
  readonly nativeEvent: { readonly isComposing: boolean };
  readonly preventDefault: () => void;
};

export const submitOnEnter = ({
  event,
  isBusy,
  send,
  sendOnEnter,
}: {
  readonly event: ComposerEnterEvent;
  readonly isBusy: boolean;
  readonly send: () => void;
  readonly sendOnEnter: boolean;
}): void => {
  if (event.key !== "Enter") return;
  // An IME composition confirm (Enter accepting a candidate) must never send:
  // `isComposing` covers modern engines, keyCode 229 the older ones whose keydown
  // fires before the composition commits.
  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
  // While streaming the field is editable for drafting, but Enter neither sends nor
  // stops — it inserts a newline. Stopping is the send button's job.
  if (isBusy) return;
  if (sendOnEnter && event.shiftKey) return; // Shift+Enter = newline
  if (!sendOnEnter && !event.ctrlKey && !event.metaKey) return; // bare Enter = newline
  event.preventDefault();
  send();
};
