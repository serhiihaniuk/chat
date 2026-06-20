import { ToolRow } from '@side-chat/side-chat-widget/ui/tool-row';

export function ToolRowDemo() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
        maxWidth: '20rem',
        color: 'var(--foreground)',
      }}
    >
      <ToolRow name="search_web" state="running" />
      <ToolRow name="read_file" state="success" />
      <ToolRow name="run_tests" state="error" />
    </div>
  );
}
