/**
 * Demo for the Message actions row.
 *
 * Renders the REAL <MessageActions> ghost button row beneath a sample assistant
 * answer, mirroring MessageActionsSection. Demo-level layout uses inline styles +
 * widget tokens (the shadow root only ships the widget's compiled CSS); the
 * component carries its own `sc-action` appearance, including the transient
 * "Copied" success swap when Copy is pressed.
 */
import { MessageActions } from "@side-chat/side-chat-widget/ui/message-actions";

export function MessageActionsDemo() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        maxWidth: "44.5rem",
        color: "var(--foreground)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "0.875rem",
          lineHeight: 1.6,
          color: "var(--foreground)",
        }}
      >
        Yes — you can pass a custom <code>container</code> to keep popups inside the themed root.
        That preserves both the tokens and the font.
      </p>
      <MessageActions />
    </div>
  );
}
