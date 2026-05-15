import { Hono } from 'hono'

import { createDefaultDeps, createInboundApp } from './index.js'
import type { StreamChatDeps } from '../../application/stream-chat.js'

export const createApp = (deps: StreamChatDeps = createDefaultDeps()) => {
  const app = new Hono()
  app.route('/', createInboundApp(deps))
  return app
}

export default createApp
