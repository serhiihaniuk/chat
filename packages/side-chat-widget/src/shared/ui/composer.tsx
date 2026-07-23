/**
 * Composer: the message input and its controls.
 *
 * The shell contains the textarea, tools menu, real context meter, model selector,
 * and send button. `sc-composer` owns the `:focus-within` ring, so focusing the
 * textarea highlights the whole surface. `sc-send` changes between disabled idle,
 * send, and stop through its native disabled state plus `data-armed`.
 *
 * The field stays enabled while a turn streams so the next message can be drafted.
 * Enter inserts a newline; stopping is the button's job. Focus returns to the
 * field after sending and when the turn finishes.
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
import { ArrowUp, Square } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { useWidgetLabels } from "#shared/lib/widget-labels";
import { ContextMeter } from "#shared/ui/context-meter";

export type ComposerStatus = "idle" | "submitted" | "streaming" | "error";

export type ComposerProps = {
  readonly className?: string;
  readonly contextUsedTokens?: number | undefined;
  readonly contextWindowTokens?: number | undefined;
  readonly defaultValue?: string;
  readonly disabled?: boolean;
  readonly modelSelector: ReactNode;
  readonly toolsMenu: ReactNode;
  readonly onStop?: () => void;
  readonly onSubmit?: (messageText: string) => Promise<void> | void;
  readonly onValueChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly sendLabel?: string;
  readonly stopLabel?: string;
  // When true (default) Enter sends and Shift+Enter inserts a newline; when false
  // (the "Send with Ctrl+Enter" preference) Ctrl/Cmd+Enter sends and Enter is a newline.
  readonly sendOnEnter?: boolean;
  readonly status?: ComposerStatus;
  readonly value?: string;
};

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
  stopLabel = "Stop generating",
  sendOnEnter = true,
  status = "idle",
  value,
}: ComposerProps): ReactElement {
  const labels = useWidgetLabels();
  const { setText, text } = useComposerText({
    defaultValue,
    onValueChange,
    value,
  });
  const isBusy = isBusyStatus(status);
  const canSend = canSubmitText(text, disabled, isBusy);
  const sendButtonDisabled = isSendButtonDisabled(canSend, isBusy);
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
        {toolsMenu}
        <ContextMeter usedTokens={contextUsedTokens} windowTokens={contextWindowTokens} />
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          {modelSelector}
          <button
            aria-label={isBusy ? stopLabel : sendLabel}
            className="sc-send"
            data-armed={canSend || isBusy ? true : undefined}
            disabled={sendButtonDisabled}
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

const isSendButtonDisabled = (canSend: boolean, isBusy: boolean): boolean => !canSend && !isBusy;

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
