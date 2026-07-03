/**
 * Activity images — inline thumbnails for images an activity produced.
 *
 * Safe defaults by design: size is constrained by the widget (max height, full
 * width cap), the payload is embedded as a data: URI (no host-controlled URL
 * fetch), and no host CSS reaches the <img>. Captions ride under the thumbnail
 * in meta type.
 */
import type { ReactElement } from "react";

/** One produced image; structurally matches the protocol's ActivityImage. */
export type ActivityImageData = {
  readonly alt: string;
  readonly caption?: string | undefined;
  readonly mediaType: string;
  readonly data: string;
};

export function ActivityImages({
  images,
}: {
  readonly images: readonly ActivityImageData[];
}): ReactElement | undefined {
  if (images.length === 0) return undefined;

  return (
    <div data-slot="activity-images" className="flex flex-wrap gap-2">
      {images.map((image, index) => (
        <figure key={`${image.alt}-${index}`} className="flex max-w-full flex-col gap-1">
          <img
            alt={image.alt}
            className="max-h-40 max-w-full rounded-lg border border-border"
            loading="lazy"
            src={toImageSrc(image)}
          />
          {image.caption && (
            <figcaption className="truncate text-xs text-muted-foreground">
              {image.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

// The protocol carries raw base64 payload + media type; tolerate an already
// assembled data: URI so a permissive producer still renders.
const toImageSrc = (image: ActivityImageData): string =>
  image.data.startsWith("data:") ? image.data : `data:${image.mediaType};base64,${image.data}`;

// A self-contained demo payload (currentColor-only SVG, no literal colors), so
// the showcase needs no external URL — same approach as the Media (§8.5)
// placeholder.
const DEMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" fill="currentColor">
  <rect width="160" height="100" opacity="0.12"/>
  <circle cx="42" cy="38" r="14" opacity="0.45"/>
  <path d="M0 84l44-30 36 22 34-40 46 48v16H0z" opacity="0.45"/>
</svg>`;

const DEMO_IMAGES: readonly ActivityImageData[] = [
  {
    alt: "Generated chart preview",
    caption: "Generated chart preview",
    mediaType: "image/svg+xml",
    data: typeof btoa === "function" ? btoa(DEMO_SVG) : "",
  },
];

export function ActivityImagesSection(): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <ActivityImages images={DEMO_IMAGES} />
      <p className="text-xs text-muted-foreground">
        Thumbnails are height-capped and embedded as data: URIs — no host CSS, no remote fetch.
      </p>
    </div>
  );
}
