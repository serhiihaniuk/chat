/**
 * Demo for §8.5 — Media (avatar). Renders the REAL Media square across its three
 * content modes: 1–2 initials, a lucide glyph, and a cover <img> that fills the
 * square. Each variant is captioned. Wrapper layout uses inline styles + widget
 * tokens so it survives inside <Preview>'s shadow root.
 */
import { Sparkles, Wrench } from "lucide-react";

import { Media } from "@side-chat/side-chat-widget/ui/media";

// Inline avatar so the <img> mode needs no external URL. currentColor inherits the
// token-driven --media-fg from sc-media.
const PLACEHOLDER_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="currentColor">' +
      '<rect width="64" height="64" opacity="0.12"/>' +
      '<circle cx="32" cy="24" r="11"/>' +
      '<path d="M11 57a21 21 0 0 1 42 0z"/></svg>',
  );

const variants = [
  { label: "Initials", node: <Media>AB</Media> },
  {
    label: "Glyph",
    node: (
      <Media>
        <Sparkles size={16} />
      </Media>
    ),
  },
  {
    label: "Glyph",
    node: (
      <Media>
        <Wrench size={16} />
      </Media>
    ),
  },
  {
    label: "Image",
    node: (
      <Media>
        <img src={PLACEHOLDER_SVG} alt="avatar" className="size-full object-cover" />
      </Media>
    ),
  },
];

export function MediaDemo() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "1.5rem",
        alignItems: "flex-start",
        color: "var(--foreground)",
      }}
    >
      {variants.map(({ label, node }, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {node}
          <span style={{ fontSize: "0.6875rem", color: "var(--muted-foreground)" }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
