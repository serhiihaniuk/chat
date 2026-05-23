import { useReducer, type FormEvent, type ReactElement } from "react";

import { composerReducer } from "../model/composer-reducer.js";
import { initialComposerState } from "../model/composer-state.js";
import { submitComposerMessage } from "../model/submit-rules.js";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
} from "#shared/ai/prompt-input";

export type ChatComposerLabels = {
  readonly context?: string;
  readonly contextUsage?: string;
  readonly inputLabel?: string;
  readonly model?: string;
  readonly placeholder?: string;
  readonly send?: string;
};

export type ChatComposerProps = {
  readonly disabled: boolean;
  readonly labels?: ChatComposerLabels;
  readonly onSubmit: (message: string) => void;
};

export const ChatComposer = ({
  disabled,
  labels = {},
  onSubmit,
}: ChatComposerProps): ReactElement => {
  const [state, dispatch] = useReducer(composerReducer, initialComposerState);
  const metaItems = [labels.contextUsage, labels.context, labels.model].filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const submitted = submitComposerMessage(state.message, disabled, onSubmit);
    if (submitted) dispatch({ type: "submitted" });
  };

  return (
    <PromptInput className="side-chat-composer" onSubmit={handleSubmit}>
      <label className="side-chat-composer__label">
        <span className="sr-only">{labels.inputLabel ?? "Message"}</span>
        <PromptInputTextarea
          className="side-chat-composer__input"
          disabled={disabled}
          onChange={(event) => {
            dispatch({
              message: event.currentTarget.value,
              type: "message_changed",
            });
          }}
          placeholder={labels.placeholder ?? "Ask a question"}
          value={state.message}
        />
      </label>
      <PromptInputToolbar className="side-chat-composer__footer">
        {metaItems.length > 0 ? (
          <div
            className="side-chat-composer__meta flex min-w-0 flex-wrap gap-6 text-xl text-slate-500"
            aria-label="Composer context"
          >
            {metaItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : (
          <span aria-hidden="true" />
        )}
        <PromptInputSubmit
          aria-label={labels.send ?? "Send message"}
          className="side-chat-composer__send"
          disabled={disabled}
        >
          <span aria-hidden="true">Send</span>
        </PromptInputSubmit>
      </PromptInputToolbar>
    </PromptInput>
  );
};
