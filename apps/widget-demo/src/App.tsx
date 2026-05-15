import { useState } from "react";
import { SideChatWidget } from "@side-chat/side-chat-widget";

const availableModels = [
  { provider: "openai", id: "gpt-4.1-mini" },
  { provider: "openai", id: "gpt-4.1-nano" },
];

export function App() {
  const [events, setEvents] = useState<string[]>([]);
  const record = (event: string) =>
    setEvents((current) => [event, ...current].slice(0, 4));

  return (
    <main className="demo-shell">
      <section>
        <p className="eyebrow">Reusable package consumer</p>
        <h1>Widget Demo</h1>
        <p>
          Imports SideChatWidget and package styles through the public
          @side-chat/side-chat-widget surface.
        </p>
        <div className="demo-card-grid" aria-label="Demo state checklist">
          <article>
            <strong>Seeded history</strong>
            <span>Opens demo-conversation-001 on launch.</span>
          </article>
          <article>
            <strong>Streaming markdown</strong>
            <span>Try headings, lists, links, and code prompts.</span>
          </article>
          <article>
            <strong>Error / retry</strong>
            <span>
              Send a prompt containing “fail” to exercise stream errors.
            </span>
          </article>
        </div>
        <aside className="demo-events" aria-label="Widget callback events">
          <h2>Widget callbacks</h2>
          {events.length === 0 ? (
            <p>No widget events yet.</p>
          ) : (
            <ul>
              {events.map((event) => (
                <li key={event}>{event}</li>
              ))}
            </ul>
          )}
        </aside>
      </section>
      <SideChatWidget
        apiEndpoint="/chat/stream"
        workspaceId="demo-workspace"
        initialConversationId="demo-conversation-001"
        title="Demo Assistant"
        placeholder="Ask about revenue, markdown, or failure retry"
        availableModels={availableModels}
        onOpen={() => record("opened")}
        onClose={() => record("closed")}
        onError={(error) => record(`error:${error.code}`)}
        onUsage={(usage) => record(`usage:${usage.totalTokens}`)}
      />
    </main>
  );
}
