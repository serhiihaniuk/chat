/**
 * Demo for Activity images — renders the REAL <ActivityImages> from the widget:
 * height-capped inline thumbnails built from base64 data: URIs (no remote fetch,
 * no host CSS). The payload is a self-contained currentColor SVG so the demo
 * needs no binary fixture. Layout uses inline styles + widget tokens so it
 * survives inside <Preview>'s shadow root.
 */
import {
  ActivityImages,
  type ActivityImageData,
} from "@side-chat/side-chat-widget/ui/activity/activity-images";

const DEMO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" fill="currentColor">' +
  '<rect width="160" height="100" opacity="0.12"/>' +
  '<circle cx="42" cy="38" r="14" opacity="0.45"/>' +
  '<path d="M0 84l44-30 36 22 34-40 46 48v16H0z" opacity="0.45"/></svg>';

const IMAGES: readonly ActivityImageData[] = [
  {
    alt: "Generated chart preview",
    caption: "Generated chart preview",
    mediaType: "image/svg+xml",
    data: typeof btoa === "function" ? btoa(DEMO_SVG) : "",
  },
];

export function ActivityImagesDemo() {
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
      <ActivityImages images={IMAGES} />
    </div>
  );
}
