import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
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
  const models = useMemo(() => props.availableModels?.length ? props.availableModels : [fallbackModel], [props.availableModels])
  const chat = useSideChat({
    apiEndpoint: props.apiEndpoint,
    workspaceId: props.workspaceId,
    initialConversationId: open ? props.initialConversationId : undefined,
    historyEndpoint: props.historyEndpoint,
    defaultModel: props.defaultModel ?? models[0],
    onError: props.onError,
    onUsage: props.onUsage
  })

  const canSend = draft.trim().length > 0 && !chat.isStreaming

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
    setOpen(false)
    props.onClose?.()
  }

  const selectModel = (event: ChangeEvent<HTMLSelectElement>) => {
    chat.setModel(models.find((model) => model.id === event.target.value) ?? models[0])
  }

  if (!open) {
    return (
      <button type="button" aria-label="Open assistant" className="sidechat-launcher" onClick={openWidget}>
        <Bot aria-hidden="true" />
        How can I help?
      </button>
    )
  }

  return (
    <aside className="sidechat-panel" aria-label={props.title ?? 'Side chat assistant'} data-testid="side-chat-widget" data-state={chat.isStreaming ? 'streaming' : 'open'}>
      <header>
        <strong>{props.title ?? 'Assistant'}</strong>
        <button type="button" aria-label="Close assistant" onClick={closeWidget}>
          <X aria-hidden="true" />
        </button>
      </header>

      <label>
        Model
        <select value={chat.model.id} onChange={selectModel}>
          {models.map((model) => (
            <option key={`${model.provider}:${model.id}`} value={model.id}>
              {model.id}
            </option>
          ))}
        </select>
      </label>

      <Conversation>
        {chat.isHistoryLoading ? <p>Loading conversation history…</p> : null}
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
        <div role="alert">
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
          value={draft}
          aria-label="chat-input"
          placeholder={props.placeholder ?? 'Ask about this page'}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit" disabled={!canSend}>
          <Send aria-hidden="true" />
          Send
        </button>
      </Composer>
    </aside>
  )
}
