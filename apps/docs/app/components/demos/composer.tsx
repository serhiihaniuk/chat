import { useState, type ReactNode } from 'react';

import { Composer } from '@side-chat/side-chat-widget/ui/composer';

/**
 * The Composer is self-contained: with no `modelSelector` prop it renders its own
 * ModelSelector, and it always renders its own ToolsMenu + context ring. Both popups
 * mount through the widget root's portal container, so they stay inside the preview.
 */
export function ComposerDemo() {
  const [armed, setArmed] = useState('Summarise the attached spec and list the open questions');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        width: '100%',
        maxWidth: '38rem',
        color: 'var(--foreground)',
      }}
    >
      <Field label="Idle">
        <Composer placeholder="Message Side Chat..." />
      </Field>

      <Field label="Armed">
        <Composer
          contextPercent={78}
          onSubmit={() => setArmed('')}
          onValueChange={setArmed}
          value={armed}
        />
      </Field>

      <Field label="Streaming">
        <Composer contextPercent={64} status="streaming" value="" />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--muted-foreground)' }}>
        {label}
      </span>
      {children}
    </div>
  );
}
