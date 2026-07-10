/**
 * Demo for Citations — renders the REAL widget parts: inline <InlineCitation>
 * markers (hover a chip to preview its source) inside a sentence, over the
 * foldable <SourcesFold> "N sources" list. Hovering a marker opens its preview
 * card — a favicon+domain row, the title, and the model's exact quoted excerpt —
 * while the marker itself takes its dark active state. Two linked rows (anchor,
 * hover fill, trailing open-externally arrow) and one terminal row (a pasted
 * excerpt: no url, no hover, no affordance). Both bind to the same sources by
 * number. Layout uses inline styles + widget tokens so it survives inside
 * <Preview>'s shadow root.
 */
import {
  InlineCitation,
  SourcesFold,
  type CitationSource,
} from "@side-chat/side-chat-widget/ui/activity/citations";

const SOURCES = [
  {
    label: "Regulatory framework on AI — European Commission",
    url: "https://digital-strategy.ec.europa.eu/ai",
    excerpt: "The AI Act entered into force on 1 August 2024 and will be fully applicable two years later.",
  },
  {
    label: "EU AI Act: rules for general-purpose AI take effect",
    url: "https://reuters.com/eu-ai",
    excerpt: "Obligations for general-purpose AI models began applying across the union in August 2025.",
  },
  { label: "“…fully applicable two years later” — pasted context" },
] satisfies readonly [CitationSource, CitationSource, CitationSource];

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
      <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.6 }}>
        The framework applies across the union
        <InlineCitation number={1} source={SOURCES[0]} /> and takes effect in stages
        <InlineCitation number={2} source={SOURCES[1]} />.
      </p>
      <SourcesFold defaultOpen sources={SOURCES} />
    </div>
  );
}
