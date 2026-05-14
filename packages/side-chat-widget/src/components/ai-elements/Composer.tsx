import type { ComponentPropsWithoutRef, FormEvent, ReactNode } from 'react'

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

export function ComposerInput(props: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea className="sidechat-composer-input" rows={3} {...props} />
}
