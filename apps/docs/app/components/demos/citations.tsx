/**
 * Demo for Citations — renders the REAL <SourcesFold> from the widget: the
 * foldable "N sources" attribution list under an answer. Two linked rows (anchor,
 * hover fill, trailing open-externally arrow) and one terminal row (a pasted
 * excerpt: no url, no hover, no affordance). Open by default so the rows show
 * without a click. Layout uses inline styles + widget tokens so it survives
 * inside <Preview>'s shadow root.
 */
import { SourcesFold, type CitationSource } from "@side-chat/side-chat-widget/ui/activity/citations";

const SOURCES: readonly CitationSource[] = [
  { label: "Regulatory framework on AI — European Commission", url: "https://ec.europa.eu/ai" },
  { label: "EU AI Act: rules for general-purpose AI take effect", url: "https://reuters.com/eu-ai" },
  { label: "“…fully applicable two years later” — pasted context" },
];

export function CitationsDemo() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        maxWidth: "28rem",
        color: "var(--foreground)",
      }}
    >
      <SourcesFold defaultOpen sources={SOURCES} />
    </div>
  );
}
