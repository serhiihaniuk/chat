"use client";

/**
 * Citations (design c-citation) — the foldable "N sources" list under an answer,
 * and the inline `[n]` marker that hovers a source card.
 *
 * The fold reuses the same Base UI `Collapsible` contract as the Reasoning fold
 * (identical trigger + chevron rotation + `--collapsible-panel-height` animation);
 * only the panel contents differ — source rows instead of thought/tool rows. The
 * inline marker hovers a Base UI `PreviewCard` whose body is a richer source
 * preview: a favicon+domain row, the title, then the model's exact quoted excerpt.
 * While the card is open the marker takes its dark active state, pairing the two.
 *
 * Each row: a leader glyph (a per-source brand colour derived from the domain — a
 * favicon stand-in, the one sanctioned non-token colour; terminal sources fall
 * back to a neutral kind glyph), title + domain meta, and a trailing number chip.
 * Linking is a separate axis: a source WITH a url renders as an <a> with hover fill
 * and a trailing ↗ (opens externally); a terminal source (no url) renders as a
 * <div> — default cursor, no hover, no arrow.
 */
import { useState, type CSSProperties, type ReactElement } from "react";

import { Collapsible } from "@base-ui/react/collapsible";
import { PreviewCard } from "@base-ui/react/preview-card";
import { ArrowUpRight, ChevronDown, Folder, Quote } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { useWidgetLabels } from "#shared/lib/widget-labels";
import { LinkSafetyDialog, openExternalUrl } from "#shared/ui/link-safety-dialog";
import { usePortalContainer } from "#shared/ui/widget-root";

/** One attributed source; structurally matches the protocol's ActivitySource. */
export type CitationSource = {
  readonly label: string;
  readonly url?: string | undefined;
  /** A short exact quote from the source, shown in the hover preview card. */
  readonly excerpt?: string | undefined;
};

export function SourcesFold({
  sources,
  defaultOpen = false,
}: {
  readonly sources: readonly CitationSource[];
  readonly defaultOpen?: boolean;
}): ReactElement | undefined {
  const labels = useWidgetLabels();
  const [open, setOpen] = useState(defaultOpen);
  // A linked row opens through the same §8.16 link-safety confirm as a Markdown
  // link, not a bare navigation. The fold lives outside Streamdown, so it drives
  // the dialog itself; the clicked row's url is the open state.
  const [safetyUrl, setSafetyUrl] = useState<string | null>(null);
  if (sources.length === 0) return undefined;

  return (
    <>
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <Collapsible.Trigger
          data-slot="sources-fold"
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"
        >
          <Folder className="size-3.5" />
          {labels.activitySources(sources.length)}
          <ChevronDown
            className={cn("size-3.5 transition-transform ease-out", open && "rotate-180")}
          />
        </Collapsible.Trigger>
        <Collapsible.Panel className="sc-cite-panel">
          <div className="flex flex-col gap-0.5 pt-2">
            {sources.map((source, index) => (
              <SourceRow
                key={`${source.url ?? source.label}-${index}`}
                marker={index + 1}
                source={source}
                onOpen={setSafetyUrl}
              />
            ))}
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
      <LinkSafetyDialog
        isOpen={safetyUrl !== null}
        url={safetyUrl ?? ""}
        onClose={() => setSafetyUrl(null)}
        onConfirm={() => {
          if (safetyUrl !== null) openExternalUrl(safetyUrl);
        }}
      />
    </>
  );
}

/**
 * Inline `[n]` citation marker: a chip that hovers a card of its source.
 *
 * The chip is the `PreviewCard` trigger; the card is the same source body a fold
 * row shows, portaled into the widget root so it escapes the message's overflow
 * while staying inside the themed subtree. A source with a url makes the card an
 * anchor (pointer, hover fill, trailing ↗); a terminal source is a plain card.
 */
export function InlineCitation({
  number,
  source,
}: {
  readonly number: number;
  readonly source: CitationSource;
}): ReactElement {
  const container = usePortalContainer();
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        render={
          <button
            type="button"
            className="sc-cite-ref popupopen:border-(--cite-marker-active-bg) popupopen:bg-(--cite-marker-active-bg) popupopen:text-(--cite-marker-active-fg)"
            data-slot="citation-ref"
          >
            {number}
          </button>
        }
      />
      <PreviewCard.Portal container={container}>
        <PreviewCard.Positioner sideOffset={6}>
          <PreviewCard.Popup data-slot="hover-card-content" className="sc-cite-card">
            <SourceCard source={source} />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}

const SourceRow = ({
  marker,
  source,
  onOpen,
}: {
  readonly marker: number;
  readonly source: CitationSource;
  readonly onOpen: (url: string) => void;
}): ReactElement => {
  const body = (
    <>
      <SourceBody source={source} />
      <span className="sc-cite-marker">{marker}</span>
    </>
  );

  // Linked sources are real anchors; terminal sources still list, but there is
  // nothing to open — no hover, no pointer, no trailing affordance.
  if (!source.url) {
    return (
      <div data-slot="source-row" className="sc-cite-source">
        {body}
      </div>
    );
  }

  // Keep the real href (right-click "copy link", middle-click) but intercept the
  // left click to route through the link-safety confirm instead of navigating.
  const url = source.url;
  return (
    <a
      data-slot="source-row"
      className="sc-cite-source"
      href={url}
      {...EXTERNAL_LINK}
      onClick={(event) => {
        event.preventDefault();
        onOpen(url);
      }}
    >
      {body}
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
};

// The hover card's body: a source preview stacked by --cite-card-gap — a
// favicon+domain row, the title (free to wrap), then the model's exact quoted
// excerpt when it supplied one. A preview only; opening the source is the fold
// row's job (its trailing ↗), matching the design's preview/open split.
const SourceCard = ({ source }: { readonly source: CitationSource }): ReactElement => {
  const domain = readDomain(source.url);
  return (
    <div className="flex flex-col gap-(--cite-card-gap)">
      <span className="flex min-w-0 items-center gap-2">
        <SourceGlyph domain={domain} />
        {domain && <span className="truncate text-xs text-muted-foreground">{domain}</span>}
      </span>
      <span className="text-sm font-semibold text-card-foreground">{source.label}</span>
      {source.excerpt && (
        <span className="text-xs leading-relaxed text-muted-foreground">{`“${source.excerpt}”`}</span>
      )}
    </div>
  );
};

const SourceBody = ({ source }: { readonly source: CitationSource }): ReactElement => {
  const domain = readDomain(source.url);
  return (
    <>
      <SourceGlyph domain={domain} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-card-foreground">{source.label}</span>
        {domain && <span className="truncate text-xs text-muted-foreground">{domain}</span>}
      </span>
    </>
  );
};

const EXTERNAL_LINK = { rel: "noreferrer noopener", target: "_blank" } as const;

// Leader glyph: the domain's first letter on a per-source brand colour derived
// from the domain (a favicon stand-in — the one sanctioned non-token colour, since
// the protocol carries no favicon). Terminal sources (no domain) fall back to the
// neutral tokenized kind glyph.
const SourceGlyph = ({ domain }: { readonly domain: string | undefined }): ReactElement => {
  if (!domain) {
    return (
      <span className="sc-cite-glyph" aria-hidden="true">
        <Quote className="size-2.5" />
      </span>
    );
  }
  return (
    <span className="sc-cite-glyph" aria-hidden="true" style={glyphBrandStyle(domain)}>
      {domain.charAt(0).toUpperCase()}
    </span>
  );
};

// A stable hue hashed from the domain gives each source a distinct favicon-like
// badge without a real favicon. Fixed saturation/lightness keep the white glyph
// legible; the same domain maps to the same colour on every render.
const glyphBrandStyle = (domain: string): CSSProperties => {
  let hue = 0;
  for (let index = 0; index < domain.length; index += 1) {
    hue = (hue * 31 + domain.charCodeAt(index)) % 360;
  }
  return { background: `hsl(${hue} 55% 42%)`, borderColor: "transparent", color: "hsl(0 0% 100%)" };
};

const readDomain = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return undefined;
  }
};
