import { SideChatWidget } from '@side-chat/side-chat-widget'
export function App() { return <main><h1>Widget Demo</h1><SideChatWidget apiEndpoint="/chat/stream" workspaceId="demo-workspace" initialConversationId="demo-conversation-001" availableModels={[{ provider: 'openai', id: 'gpt-4.1-mini' }, { provider: 'openai', id: 'gpt-4.1' }]} /></main> }
