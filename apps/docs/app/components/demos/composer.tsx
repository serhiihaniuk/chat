import { useState, type ReactNode } from 'react';

import { Composer } from '@side-chat/side-chat-widget/ui/composer';

/**
 * The Composer is self-contained: with no `modelSelector` prop it renders its own
 * ModelSelector, and always its own ToolsMenu. The context meter appears only when
 * both `contextUsedTokens` and `contextWindowTokens` are known, so it reads a real
 * fill (hover it for "used / window tokens") instead of a decorative percentage.
 * Both popups mount through the widget root's portal container, staying in-preview.
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
        <Composer
          contextUsedTokens={24_000}
          contextWindowTokens={200_000}
          placeholder="Message Side Chat..."
        />
      </Field>

      <Field label="Armed">
        <Composer
          contextUsedTokens={156_000}
          contextWindowTokens={200_000}
          onSubmit={() => setArmed('')}
          onValueChange={setArmed}
          value={armed}
        />
      </Field>

      <Field label="Streaming">
        <Composer
          contextUsedTokens={188_000}
          contextWindowTokens={200_000}
          status="streaming"
          value=""
        />
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
