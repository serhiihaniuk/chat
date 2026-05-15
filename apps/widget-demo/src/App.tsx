import { SideChatWidget } from '@side-chat/side-chat-widget'

const availableModels = [
  { provider: 'openai', id: 'gpt-4.1-mini' },
  { provider: 'openai', id: 'gpt-4.1-nano' }
]

export function App() {
  return (
    <main className="demo-shell">
      <section>
        <p className="eyebrow">Reusable package consumer</p>
        <h1>Widget Demo</h1>
        <p>Imports SideChatWidget and package styles through the public @side-chat/side-chat-widget surface.</p>
      </section>
      <SideChatWidget
        apiEndpoint="/chat/stream"
        workspaceId="demo-workspace"
        initialConversationId="demo-conversation-001"
        title="Demo Assistant"
        availableModels={availableModels}
      />
    </main>
  )
}
