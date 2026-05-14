import type { ReactNode } from 'react'

export function Conversation({ children }: { children: ReactNode }) {
  return (
    <div className="sidechat-conversation" role="log" aria-live="polite">
      {children}
    </div>
  )
}

export function Message({
  role,
  children
}: {
  role: 'user' | 'assistant' | 'system'
  children: ReactNode
}) {
  return (
    <article className={`sidechat-message sidechat-message-${role}`} data-role={role}>
      {children}
    </article>
  )
}
