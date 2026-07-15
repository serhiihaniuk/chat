/**
 * Markdown / Streamdown wrapper.
 *
 * The ONE wrapper every assistant message renders through (never raw `<Streamdown>`).
 * We do NOT parse Markdown ourselves — Streamdown owns parsing, GFM, sanitization,
 * Shiki, link safety and incomplete-stream repair. All kit customization lives here.
 *
 * The `.sc-markdown` hook class styles Streamdown's rendered DOM (code/links/tables/
 * lists/headings) through tokens, so this file adds NO one-off colours.
 */
import { useMemo, type ComponentProps, type ReactElement } from "react";

import { Streamdown } from "streamdown";

import { InlineCitation } from "#shared/ui/activity/citations";
import { LinkSafetyDialog } from "#shared/ui/link-safety-dialog";
import {
  footnoteSourceForMarker,
  hideUnresolvedFootnoteMarkers,
  parseFootnoteSources,
  reactNodeText,
  type FootnoteSource,
} from "./footnote-sources.js";

export type MarkdownMode = "streaming" | "static";

export function MarkdownContent({
  children,
  mode = "static",
}: {
  children: string;
  /** `streaming` = live turn (repairs half-written fences/tables); `static` = history. */
  mode?: MarkdownMode;
}): ReactElement {
  // Citations the model authored as GFM footnotes. This wrapper only renders the
  // INLINE `[^n]` chips (and suppresses Streamdown's default footnotes block); the
  // "N sources" fold is a sibling of the answer in the message view, so one flex
  // gap spaces reasoning, answer, and sources by a single token. Both the chips
  // here and that fold parse the same definitions, so their numbering agrees.
  // While streaming, hide footnote markers whose `[^n]:` definitions have not
  // arrived yet so they don't flash as raw "[^1]" text; each resolves to an inline
  // chip the instant its definition streams in. Completed history renders verbatim,
  // so a genuinely dangling marker still degrades to plain text.
  const content = useMemo(
    () => (mode === "streaming" ? hideUnresolvedFootnoteMarkers(children) : children),
    [children, mode],
  );
  const sources = useMemo(() => parseFootnoteSources(content), [content]);
  const components = useMemo(() => citationComponents(sources), [sources]);

  return (
    <div className="sc-markdown">
      <Streamdown
        mode={mode}
        // Repair is gated on `mode`: only a live stream may have an unclosed
        // fence/table to mend; history is already complete, so leave it verbatim.
        parseIncompleteMarkdown={mode === "streaming"}
        dir="auto"
        components={components}
        controls={{ code: { copy: true, download: false } }}
        // Streamdown's built-in confirm modal renders outside the widget's token
        // scope (unstyled over the host page), so link safety stays on but the
        // modal is ours: the panel-scoped Dialog, with copy from the labels
        // bag so it rebrands/localizes with the rest of the widget.
        linkSafety={{
          enabled: true,
          renderModal: (props) => (
            <LinkSafetyDialog
              isOpen={props.isOpen}
              onClose={props.onClose}
              onConfirm={props.onConfirm}
              url={props.url}
            />
          ),
        }}
      >
        {content}
      </Streamdown>
    </div>
  );
}

/**
 * Component overrides that turn GFM footnotes into the citation system.
 *
 * `sup` — a footnote reference renders as the number; resolve it to a parsed
 * source and swap in the inline hover chip, else leave the plain superscript so a
 * stray marker never becomes a broken chip. `section` — drop Streamdown's default
 * footnotes block; the `SourcesFold` renders those sources instead.
 */
const citationComponents = (sources: readonly FootnoteSource[]) => ({
  h1: (props: ComponentProps<"h1">): ReactElement => (
    <h1 {...props} className="sc-message-heading-1" />
  ),
  h2: (props: ComponentProps<"h2">): ReactElement => (
    <h2 {...props} className="sc-message-heading-2" />
  ),
  h3: (props: ComponentProps<"h3">): ReactElement => (
    <h3 {...props} className="sc-message-heading-3" />
  ),
  h4: (props: ComponentProps<"h4">): ReactElement => (
    <h4 {...props} className="sc-message-heading-3" />
  ),
  h5: (props: ComponentProps<"h5">): ReactElement => (
    <h5 {...props} className="sc-message-heading-3" />
  ),
  h6: (props: ComponentProps<"h6">): ReactElement => (
    <h6 {...props} className="sc-message-heading-3" />
  ),
  sup: (props: ComponentProps<"sup">): ReactElement => {
    const source = footnoteSourceForMarker(sources, reactNodeText(props.children));
    return source ? <InlineCitation number={source.number} source={source} /> : <sup {...props} />;
  },
  section: ({ children, ...props }: ComponentProps<"section">): ReactElement | null =>
    "data-footnotes" in props ? null : <section {...props}>{children}</section>,
});
