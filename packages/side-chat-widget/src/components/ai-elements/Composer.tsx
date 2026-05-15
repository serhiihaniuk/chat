import type { ComponentPropsWithoutRef, FormEvent, ReactNode } from 'react'
import { forwardRef } from 'react'

export function Composer({
  children,
  onSubmit
}: {
  children: ReactNode
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form className="sidechat-composer" onSubmit={onSubmit}>
      {children}
    </form>
  )
}

export const ComposerInput = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<'textarea'>>(
  function ComposerInput(props, ref) {
    return <textarea ref={ref} className="sidechat-composer-input" rows={3} {...props} />
  }
)
