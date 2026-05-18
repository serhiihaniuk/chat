import { PanelTop, Send } from "lucide-react";
import { useId } from "react";
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
} from "../../shared/ui/ai-elements/context.js";
import {
  PromptInput,
  PromptInputModelSelect,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "../../shared/ui/ai-elements/prompt-input.js";
import { recentContextTotalCharacters } from "../../domain/message/message-presentation.js";
import { modelAliasOptions } from "../../domain/model/model-selection.js";

/**
 * Composer presentation slice. It owns the input controls and model easter egg;
 * send behavior stays in the shell/adapters.
 */
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
          className="max-sm:hidden"
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
        <PageContextIndicator />
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

const PageContextIndicator = () => {
  const tooltipId = useId();

  return (
    <span className="group/page-context relative inline-flex shrink-0 max-sm:hidden">
      <span
        aria-describedby={tooltipId}
        aria-label="Using current page context"
        className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-slate-500 outline-none transition hover:bg-slate-50 hover:text-slate-800 focus:ring-2 focus:ring-blue-500/20 max-sm:h-8 [&_svg]:size-4"
        tabIndex={0}
      >
        <PanelTop aria-hidden="true" className="shrink-0" />
        <span className="whitespace-nowrap">Page</span>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-600" />
      </span>
      <span
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-80 max-w-[calc(100vw-3rem)] rounded-md border border-border bg-white p-3 text-sm text-slate-700 shadow-lg group-hover/page-context:block group-focus-within/page-context:block"
        id={tooltipId}
        role="tooltip"
      >
        <strong className="block text-sm text-slate-900">Page context</strong>
        <span className="mt-2 block leading-5">
          The assistant can use the current Workbench surface: visible dashboard
          KPIs, portfolio table rows, active filters, and selected client context.
        </span>
        <span className="mt-2 block rounded bg-slate-50 p-2 text-xs leading-5 text-slate-500">
          It does not automatically inspect other pages or hidden browser state.
        </span>
      </span>
    </span>
  );
};

const handleComposerInputKeyDown = (
  event: KeyboardEvent<HTMLTextAreaElement>,
) => {
  if (event.key !== "Enter" || event.shiftKey) return;

  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
};
