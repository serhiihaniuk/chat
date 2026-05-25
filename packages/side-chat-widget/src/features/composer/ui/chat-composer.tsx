import {
  useReducer,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import type { UsageMetadata } from "@side-chat/chat-protocol";

import { composerReducer } from "../model/composer-reducer.js";
import { initialComposerState } from "../model/composer-state.js";
import {
  defaultAssistantProfile,
  type AssistantProfileOption,
} from "../model/model-selection.js";
import { submitComposerMessage } from "../model/submit-rules.js";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
} from "#shared/ai/prompt-input";
import {
  ChevronDownIcon,
  PagePanelIcon,
  SendIcon,
  SparklesIcon,
} from "#shared/assets/icons/panel-icons";

export type ChatComposerLabels = {
  readonly context?: string;
  readonly contextUsage?: string;
  readonly inputLabel?: string;
  readonly model?: string;
  readonly pageContext?: string;
  readonly placeholder?: string;
  readonly send?: string;
};

export type ChatComposerProps = {
  readonly assistantProfileId?: string;
  readonly assistantProfiles?: readonly AssistantProfileOption[];
  readonly disabled: boolean;
  readonly labels?: ChatComposerLabels;
  readonly onAssistantProfileChange?: (profileId: string) => void;
  readonly onSubmit: (message: string) => void;
  readonly usage?: UsageMetadata;
};

export const ChatComposer = ({
  assistantProfileId,
  assistantProfiles,
  disabled,
  labels = {},
  onAssistantProfileChange,
  onSubmit,
  usage,
}: ChatComposerProps): ReactElement => {
  const [state, dispatch] = useReducer(composerReducer, initialComposerState);
  const view = resolveComposerView({
    assistantProfileId,
    assistantProfiles,
    labels,
    usage,
  });

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
          placeholder={labels.placeholder ?? "Ask about this page"}
          value={state.message}
          onKeyDown={handleComposerInputKeyDown}
        />
      </label>
      <PromptInputToolbar className="side-chat-composer__footer">
        <div
          className="side-chat-composer__meta flex min-w-0 flex-wrap items-center gap-6 text-[1.75rem] leading-none text-slate-500 max-[720px]:gap-2 max-[720px]:text-sm"
          aria-label="Composer context"
        >
          <ContextMeter label={labels.context} usage={view.contextUsage} />
          <PageContext label={labels.pageContext} />
          <label className="relative inline-flex h-10 items-center gap-3 rounded-md text-slate-600 [&_svg]:size-8 max-[720px]:[&_svg]:size-5">
            <span className="sr-only">
              {labels.model ?? "Assistant profile"}
            </span>
            <SparklesIcon />
            <select
              className="min-w-36 appearance-none border-0 bg-transparent pr-8 text-[1.75rem] font-normal text-slate-600 outline-none disabled:cursor-not-allowed disabled:opacity-50 max-[720px]:min-w-24 max-[720px]:text-sm"
              disabled={disabled}
              onChange={(event) =>
                onAssistantProfileChange?.(event.currentTarget.value)
              }
              value={view.selectedProfileId}
            >
              {view.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-0 [&_svg]:size-5">
              <ChevronDownIcon />
            </span>
          </label>
        </div>
        <PromptInputSubmit
          aria-label={labels.send ?? "Send message"}
          className="side-chat-composer__send"
          disabled={disabled || state.message.trim().length === 0}
        >
          <SendIcon />
        </PromptInputSubmit>
      </PromptInputToolbar>
    </PromptInput>
  );
};

const handleComposerInputKeyDown = (
  event: KeyboardEvent<HTMLTextAreaElement>,
): void => {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
};

const formatUsage = (usage: UsageMetadata | undefined): string | undefined => {
  if (!usage?.totalTokens) return "0%";
  return `${Math.min(100, Math.round(usage.totalTokens / 60)).toLocaleString()}%`;
};

type ComposerViewInput = {
  readonly assistantProfileId: string | undefined;
  readonly assistantProfiles: readonly AssistantProfileOption[] | undefined;
  readonly labels: ChatComposerLabels;
  readonly usage: UsageMetadata | undefined;
};

const resolveComposerView = ({
  assistantProfileId,
  assistantProfiles,
  labels,
  usage,
}: ComposerViewInput): {
  readonly contextUsage: string | undefined;
  readonly profiles: readonly AssistantProfileOption[];
  readonly selectedProfileId: string;
} => {
  const profiles = assistantProfiles ?? [defaultAssistantProfile];
  return {
    contextUsage: labels.contextUsage ?? formatUsage(usage) ?? "0%",
    profiles,
    selectedProfileId:
      assistantProfileId ?? profiles[0]?.id ?? defaultAssistantProfile.id,
  };
};

const ContextMeter = ({
  label,
  usage,
}: {
  readonly label: string | undefined;
  readonly usage: string | undefined;
}): ReactElement => (
  <span className="inline-flex h-10 shrink-0 items-center gap-3 rounded-md text-slate-600">
    <span>{label ?? "Context"}</span>
    <span>{usage ?? "0%"}</span>
    <span
      aria-hidden="true"
      className="size-7 rounded-full border-4 border-slate-300 max-[720px]:size-4 max-[720px]:border-2"
    />
  </span>
);

const PageContext = ({
  label,
}: {
  readonly label: string | undefined;
}): ReactElement => (
  <span className="inline-flex h-10 shrink-0 items-center gap-3 rounded-md font-semibold text-slate-600 [&_svg]:size-8 max-[720px]:[&_svg]:size-5">
    <PagePanelIcon />
    <span>{label ?? "Page"}</span>
    <span
      aria-hidden="true"
      className="size-2.5 rounded-full bg-emerald-600 max-[720px]:size-1.5"
    />
  </span>
);
