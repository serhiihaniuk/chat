import { Hono } from 'hono'

import { inboundApp } from './index'

export const createApp = () => {
  const app = new Hono()
  app.route('/', inboundApp)
  return app
}

export default createApp
