import type { WidgetState } from "../../domain/message/state.js";

export type FeedProps = {
  readonly state: WidgetState;
};

export const Feed = ({ state }: FeedProps) => (
  <section aria-label="Conversation" className="side-chat-feed">
    {state.messages.map((message) => (
      <article
        className={`side-chat-message side-chat-message--${message.role}`}
        key={message.id}
      >
        <strong>{message.role}</strong>
        <p>{message.content}</p>
      </article>
    ))}
    {state.reasoning.map((summary) => (
      <aside className="side-chat-reasoning" key={summary}>
        {summary}
      </aside>
    ))}
    {state.tools.map((tool) => (
      <aside className="side-chat-tool" key={tool.toolCallId}>
        {tool.toolName}: {tool.status}
      </aside>
    ))}
    {state.hostCommands.map((command) => (
      <aside className="side-chat-host-command" key={command.event.commandId}>
        {command.event.commandName}: {command.result?.status ?? "pending"}
      </aside>
    ))}
    {state.errorMessage ? (
      <p className="side-chat-error" role="alert">
        {state.errorMessage}
      </p>
    ) : null}
  </section>
);
