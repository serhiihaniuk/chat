/**
 * §10 — Markdown / Streamdown wrapper.
 *
 * The ONE wrapper every assistant message renders through (never raw `<Streamdown>`).
 * We do NOT parse Markdown ourselves — Streamdown owns parsing, GFM, sanitization,
 * Shiki, link safety and incomplete-stream repair. All kit customization lives here.
 *
 * The `.sc-markdown` hook class styles Streamdown's rendered DOM (code/links/tables/
 * lists/headings) through tokens, so this file adds NO one-off colours.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";

import { Check, Copy, ExternalLink } from "lucide-react";
import { Streamdown } from "streamdown";

import { useWidgetLabels } from "#shared/lib/widget-labels";
import { InlineCitation } from "#shared/ui/activity/citations";
import { Button } from "#shared/ui/button";
import { WidgetDialog } from "#shared/ui/dialog";
import {
  footnoteSourceForMarker,
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
  const sources = useMemo(() => parseFootnoteSources(children), [children]);
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
        // Streamdown's built-in confirm modal renders outside the widget's token
        // scope (unstyled over the host page), so link safety stays on but the
        // modal is ours: the §8.16 panel-scoped dialog, with copy from the labels
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
        {children}
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
  sup: (props: ComponentProps<"sup">): ReactElement => {
    const source = footnoteSourceForMarker(sources, reactNodeText(props.children));
    return source ? <InlineCitation number={source.number} source={source} /> : <sup {...props} />;
  },
  section: ({ children, ...props }: ComponentProps<"section">): ReactElement | null =>
    "data-footnotes" in props ? null : <section {...props}>{children}</section>,
});

const COPIED_RESET_MS = 2_000;

/**
 * The link-safety confirm for external links in assistant output.
 *
 * Streamdown owns the flow (it intercepts the click and opens the URL on
 * `onConfirm`); this dialog only presents it: the destination URL verbatim —
 * link text can lie, the href cannot — plus copy-instead and open actions.
 */
function LinkSafetyDialog({
  isOpen,
  onClose,
  onConfirm,
  url,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  url: string;
}): ReactElement {
  const labels = useWidgetLabels();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard unavailable (permissions, insecure context): the URL stays
      // visible in the dialog for manual selection, so no error surface needed.
    }
  }, [url]);

  return (
    <WidgetDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={labels.linkSafetyTitle}
      description={labels.linkSafetyDescription}
    >
      <p className="mt-3 break-all rounded-md border border-border bg-muted px-2.5 py-2 text-xs text-muted-foreground">
        {url}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => void copyUrl()}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? labels.linkSafetyCopied : labels.linkSafetyCopy}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          <ExternalLink className="size-3.5" />
          {labels.linkSafetyOpen}
        </Button>
      </div>
    </WidgetDialog>
  );
}
