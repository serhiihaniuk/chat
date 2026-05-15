import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Bot, Loader2, Send, X } from 'lucide-react'
import type { ModelSelection, TokenUsage } from '@side-chat/shared-protocol'
import { Composer, ComposerInput } from './components/ai-elements/Composer.js'
import { Conversation, Message } from './components/ai-elements/Conversation.js'
import { Response } from './components/ai-elements/Response.js'
import { useSideChat, type SideChatError } from './hooks/use-side-chat.js'

export type SideChatWidgetProps = {
  apiEndpoint: string
  workspaceId: string
  initialConversationId?: string
  historyEndpoint?: string
  title?: string
  placeholder?: string
  defaultModel?: ModelSelection
  availableModels?: ModelSelection[]
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: SideChatError) => void
  onUsage?: (usage: TokenUsage) => void
}

const fallbackModel: ModelSelection = { provider: 'openai', id: 'gpt-4.1-mini' }

export function SideChatWidget(props: SideChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const launcherButtonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const models = useMemo(() => props.availableModels?.length ? props.availableModels : [fallbackModel], [props.availableModels])
  const chat = useSideChat({
    apiEndpoint: props.apiEndpoint,
    workspaceId: props.workspaceId,
    initialConversationId: props.initialConversationId,
    historyEndpoint: props.historyEndpoint,
    defaultModel: props.defaultModel ?? models[0],
    onError: props.onError,
    onUsage: props.onUsage
  })

  const canSend = draft.trim().length > 0 && !chat.isStreaming

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      return
    }

    if (restoreLauncherFocus.current) {
      launcherRef.current?.focus()
      restoreLauncherFocus.current = false
    }
  }, [open])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSend) return
    void chat.sendMessage(draft)
    setDraft('')
  }

  const openWidget = () => {
    setOpen(true)
    props.onOpen?.()
  }

  const closeWidget = () => {
    restoreLauncherFocus.current = true
    setOpen(false)
    props.onClose?.()
  }

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      closeWidget()
    }
  }

  const selectModel = (event: ChangeEvent<HTMLSelectElement>) => {
    chat.setModel(models.find((model) => model.id === event.target.value) ?? models[0])
  }

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    } else {
      launcherButtonRef.current?.focus()
    }
  }, [open])

  const widgetState = chat.isHistoryLoading
    ? 'loading'
    : chat.error
      ? 'error'
      : chat.isStreaming
        ? 'streaming'
        : chat.messages.length === 0
          ? 'empty'
          : 'ready'

  if (!open) {
    return (
      <button
        ref={launcherButtonRef}
        type="button"
        aria-label="Open assistant"
        aria-expanded={false}
        aria-controls="side-chat-widget-panel"
        className="sidechat-launcher"
        onClick={openWidget}
      >
        <Bot aria-hidden="true" />
        How can I help?
      </button>
    )
  }

  return (
    <aside
      id="side-chat-widget-panel"
      className="sidechat-panel"
      aria-label={props.title ?? 'Side chat assistant'}
      aria-live="polite"
      data-testid="side-chat-widget"
      data-state={widgetState}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeWidget()
        }
      }}
    >
      <header>
        <strong>{props.title ?? 'Assistant'}</strong>
        <button type="button" aria-label="Close assistant" onClick={closeWidget}>
          <X aria-hidden="true" />
        </button>
      </header>

      <label>
        Model
        <select value={chat.model.id} onChange={selectModel} disabled={chat.isStreaming}>
          {models.map((model) => (
            <option key={`${model.provider}:${model.id}`} value={model.id}>
              {model.id}
            </option>
          ))}
        </select>

      <Conversation>
        {chat.isHistoryLoading ? <p role="status">Loading conversation history…</p> : null}
        {chat.historyStatus === 'loaded' ? <p className="sidechat-history-status">Loaded seeded conversation history.</p> : null}
        {chat.historyStatus === 'empty' ? <p className="sidechat-history-status">No prior messages in this conversation.</p> : null}
        {chat.messages.length === 0 ? (
          <section className="sidechat-empty-state" aria-label="Empty assistant conversation">
            <p className="sidechat-empty-eyebrow">How can I help?</p>
            <p>Ask a question about this workspace, switch models, or try a markdown-heavy prompt.</p>
          </section>
        ) : (
          chat.messages.map((message) => (
            <Message key={message.id} role={message.role}>
              {message.role === 'assistant' ? <Response content={message.content} /> : message.content}
            </Message>
          ))
        )}
      </Conversation>

      {chat.error ? (
        <div role="alert" className="sidechat-error">
          {chat.error.message}
          {chat.error.retryable ? (
            <button type="button" onClick={chat.retryLastMessage} disabled={chat.isStreaming}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="sidechat-status-row">
        <output aria-live="polite">Model: {chat.model.id}</output>
        {chat.isStreaming ? (
          <span role="status" className="sidechat-streaming-status">
            <Loader2 aria-hidden="true" /> Streaming…
          </span>
        ) : null}
        {chat.usage ? <output aria-live="polite">Tokens: {chat.usage.totalTokens}</output> : null}
      </div>

      <Composer onSubmit={submit}>
        <ComposerInput
          ref={inputRef}
          value={draft}
          aria-label="chat-input"
          placeholder={props.placeholder ?? 'Ask about this page'}
          onChange={(event) => setDraft(event.currentTarget.value)}
          ref={inputRef}
        />
        <button type="submit" disabled={!canSend} aria-label="send message">
          <Send aria-hidden="true" />
          Send
        </button>
      </Composer>
    </aside>
  )
}
