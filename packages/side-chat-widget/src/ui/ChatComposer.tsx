import { Globe2, Send } from "lucide-react";
import type {
  FormEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import type { TokenUsage } from "@side-chat/shared-protocol";

import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
} from "../components/ai-elements/context.js";
import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "../components/ai-elements/prompt-input.js";
import { recentContextTotalCharacters } from "../domain/message-presentation.js";
import { modelAliasOptions } from "../domain/model-selection.js";

export type ChatComposerProps = {
  canSend: boolean;
  draft: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isStreaming: boolean;
  modelAliasId: string;
  placeholder?: string;
  usage?: TokenUsage;
  visibleContextCharacters: number;
  onDraftChange: (draft: string) => void;
  onModelAliasChange: (aliasId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export const ChatComposer = ({
  canSend,
  draft,
  inputRef,
  isStreaming,
  modelAliasId,
  placeholder,
  usage,
  visibleContextCharacters,
  onDraftChange,
  onModelAliasChange,
  onSubmit,
}: ChatComposerProps) => (
  <PromptInput className="mx-auto w-full max-w-3xl" onSubmit={onSubmit}>
    <PromptInputTextarea
      ref={inputRef}
      value={draft}
      aria-label="chat-input"
      placeholder={placeholder ?? "Ask about this page"}
      onChange={(event) => onDraftChange(event.currentTarget.value)}
      onKeyDown={handleComposerInputKeyDown}
    />
    <PromptInputToolbar>
      <PromptInputTools>
        <Context
          description="Visible conversation context is trimmed to the last 12 messages and 6k characters."
          label="Context"
          maxTokens={recentContextTotalCharacters}
          usage={usage}
          usageLabel="Conversation usage"
          usedTokens={visibleContextCharacters}
        >
          <ContextTrigger />
          <ContextContent>
            <ContextContentHeader />
            <ContextContentBody />
            <ContextContentFooter />
          </ContextContent>
        </Context>
        <PromptInputButton disabled title="Search is not enabled yet">
          <Globe2 aria-hidden="true" />
          Search
        </PromptInputButton>
        <PromptInputModelSelect
          disabled={isStreaming}
          modelId={modelAliasId}
          onModelChange={onModelAliasChange}
          options={modelAliasOptions}
        />
      </PromptInputTools>
      <PromptInputSubmit aria-label="send message" disabled={!canSend}>
        <Send aria-hidden="true" />
      </PromptInputSubmit>
    </PromptInputToolbar>
  </PromptInput>
);

const handleComposerInputKeyDown = (
  event: KeyboardEvent<HTMLTextAreaElement>,
) => {
  if (event.key !== "Enter" || event.shiftKey) return;

  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
};
