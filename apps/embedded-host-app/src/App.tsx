import { SideChatWidget } from '@side-chat/side-chat-widget'

const availableModels = [
  { provider: 'openai', id: 'gpt-4.1-mini' },
  { provider: 'openai', id: 'gpt-4.1-nano' }
]

export function App() {
  return (
    <main>
      <section className="dashboard-hero">
        <p className="eyebrow">Acme Analytics · demo-workspace</p>
        <h1>Revenue Dashboard</h1>
        <p>Quarterly report and customer signals for demo-workspace.</p>
        <div className="metric-grid" aria-label="Revenue metrics">
          <article><span>ARR</span><strong>$4.8M</strong><small>+18% year over year</small></article>
          <article><span>Expansion</span><strong>132%</strong><small>Net revenue retention</small></article>
          <article><span>Risk accounts</span><strong>7</strong><small>Need follow-up this week</small></article>
        </div>
      </section>
      <section className="insight-panel" aria-label="Customer signal notes">
        <h2>Customer signal notes</h2>
        <ul>
          <li>Enterprise segment expanded after onboarding improvements.</li>
          <li>Self-serve trials ask for clearer usage summaries.</li>
          <li>Support tags show markdown-heavy report questions.</li>
        </ul>
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
