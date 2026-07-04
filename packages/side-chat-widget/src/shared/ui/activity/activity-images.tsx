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
