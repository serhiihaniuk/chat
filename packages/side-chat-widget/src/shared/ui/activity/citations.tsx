"use client";

/**
 * Citations (design c-citation) — the foldable "N sources" list under an answer.
 *
 * The fold reuses the same Base UI `Collapsible` contract as the Reasoning fold
 * (identical trigger + chevron rotation + `--collapsible-panel-height` animation);
 * only the panel contents differ — source rows instead of thought/tool rows.
 *
 * Each row: a leader glyph (neutral tokenized kind chip — the protocol carries no
 * favicon), title + domain meta, and a trailing number chip. Linking is a separate
 * axis: a source WITH a url renders as an <a> with hover fill and a trailing ↗
 * (opens externally); a terminal source (no url) renders as a <div> — default
 * cursor, no hover, no arrow.
 */
import { useState, type ReactElement } from "react";

import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowUpRight, ChevronDown, Folder, Quote } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { useWidgetLabels } from "#shared/lib/widget-labels";

/** One attributed source; structurally matches the protocol's ActivitySource. */
export type CitationSource = {
  readonly label: string;
  readonly url?: string | undefined;
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
  if (sources.length === 0) return undefined;

  return (
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
            />
          ))}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

const SourceRow = ({
  marker,
  source,
}: {
  readonly marker: number;
  readonly source: CitationSource;
}): ReactElement => {
  const domain = readDomain(source.url);
  const body = (
    <>
      <SourceGlyph domain={domain} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-card-foreground">{source.label}</span>
        {domain && <span className="truncate text-xs text-muted-foreground">{domain}</span>}
      </span>
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

  return (
    <a
      data-slot="source-row"
      className="sc-cite-source"
      href={source.url}
      rel="noreferrer noopener"
      target="_blank"
    >
      {body}
      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
};

// Leader glyph: the domain's first letter for web sources, a quote glyph for
// terminal ones. Neutral tokenized chip — the one sanctioned non-token color is
// a real favicon, which the protocol does not carry.
const SourceGlyph = ({ domain }: { readonly domain: string | undefined }): ReactElement => (
  <span className="sc-cite-glyph" aria-hidden="true">
    {domain ? domain.charAt(0).toUpperCase() : <Quote className="size-2.5" />}
  </span>
);

const readDomain = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
};
