import { useState, type FormEvent } from "react";

export type ComposerLabels = {
  readonly inputLabel?: string;
  readonly placeholder?: string;
  readonly send?: string;
};

export type ComposerProps = {
  readonly disabled: boolean;
  readonly labels?: ComposerLabels;
  readonly onSubmit: (message: string) => void;
};

export const submitComposerMessage = (
  message: string,
  disabled: boolean,
  onSubmit: (message: string) => void,
): boolean => {
  const trimmed = message.trim();
  if (disabled || trimmed.length === 0) return false;
  onSubmit(trimmed);
  return true;
};

export const Composer = ({
  disabled,
  labels = {},
  onSubmit,
}: ComposerProps) => {
  const [message, setMessage] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const submitted = submitComposerMessage(message, disabled, onSubmit);
    if (submitted) setMessage("");
  };

  return (
    <form className="side-chat-composer" onSubmit={handleSubmit}>
      <label className="side-chat-composer__label">
        {labels.inputLabel ?? "Message"}
        <textarea
          className="side-chat-composer__input"
          disabled={disabled}
          onChange={(event) => {
            setMessage(event.currentTarget.value);
          }}
          placeholder={labels.placeholder ?? "Ask a question"}
          value={message}
        />
      </label>
      <button
        className="side-chat-composer__send"
        disabled={disabled}
        type="submit"
      >
        {labels.send ?? "Send"}
      </button>
    </form>
  );
};
