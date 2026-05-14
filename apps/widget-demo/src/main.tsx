import React from 'react'
import { createRoot } from 'react-dom/client'
import { SideChatWidget } from '@side-chat/side-chat-widget'

import './styles.css'

const DemoApp = () => (
  <div>
    <h1>Widget Demo</h1>
    <p>Exercise package API states and markdown rendering placeholder.</p>
    <SideChatWidget apiEndpoint="http://localhost:3000" workspaceId="demo-workspace" />
  </div>
)

const appRoot = document.getElementById('root')
if (appRoot) {
  createRoot(appRoot).render(<DemoApp />)
}
