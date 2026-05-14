import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Bot, Send, X } from 'lucide-react'
import type { ModelSelection, TokenUsage } from '@side-chat/shared-protocol'
import { Composer, ComposerInput } from './components/ai-elements/Composer.js'
import { Conversation, Message } from './components/ai-elements/Conversation.js'
import { Response } from './components/ai-elements/Response.js'
import { useSideChat, type SideChatError } from './hooks/use-side-chat.js'

export type SideChatWidgetProps = {
  apiEndpoint: string
  workspaceId: string
  initialConversationId?: string
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
    initialConversationId: props.initialConversationId,
    defaultModel: props.defaultModel ?? models[0],
    onError: props.onError,
    onUsage: props.onUsage
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
    <aside className="sidechat-panel" aria-label={props.title ?? 'Side chat assistant'} data-testid="side-chat-widget">
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
        {chat.messages.length === 0 ? (
          <p>Ask a question about this workspace.</p>
        ) : (
          chat.messages.map((message) => (
            <Message key={message.id} role={message.role}>
              {message.role === 'assistant' ? <Response content={message.content} /> : message.content}
            </Message>
          ))
        )}
      </Conversation>

      {chat.error ? <div role="alert">{chat.error.message}</div> : null}
      {chat.usage ? <output>Tokens: {chat.usage.totalTokens}</output> : null}

      <Composer onSubmit={submit}>
        <ComposerInput
          value={draft}
          aria-label="chat-input"
          placeholder={props.placeholder ?? 'Ask about this page'}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit" disabled={chat.isStreaming}>
          <Send aria-hidden="true" />
          Send
        </button>
      </Composer>
    </aside>
  )
}
