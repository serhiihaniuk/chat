import { SideChatWidget } from '@side-chat/side-chat-widget'

const availableModels = [
  { provider: 'openai', id: 'gpt-4.1-mini' },
  { provider: 'openai', id: 'gpt-4.1' }
]

export function App() {
  return (
    <main>
      <section>
        <h1>Revenue Dashboard</h1>
        <p>Quarterly report and customer signals for demo-workspace.</p>
      </section>
      <SideChatWidget
        apiEndpoint="/chat/stream"
        workspaceId="demo-workspace"
        initialConversationId="demo-conversation-001"
        title="Workspace Assistant"
        availableModels={availableModels}
      />
    </main>
  )
}
