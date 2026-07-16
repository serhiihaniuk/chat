/**
 * <Term id="reaper">reaper</Term> — an inline term with a hover card that shows
 * its glossary definition. Used manually in MDX and injected automatically on
 * the first prose mention of a term by the auto-link plugin (source.config.ts).
 *
 * The card renders only after a client interaction, through a portal positioned
 * from the trigger's rect, so it never runs during the static prerender and is
 * never clipped by article overflow.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { findGlossaryTerm } from "../data/glossary/lookup";

interface TermProps {
  id: string;
  children?: ReactNode;
}

interface CardPosition {
  top: number;
  left: number;
}

const CARD_WIDTH = 320;
const GAP = 8;
const CLOSE_DELAY_MS = 120;

export function Term({ id, children }: TermProps) {
  const term = findGlossaryTerm(id);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CardPosition | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  const handleOpen = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  // Position the card from the trigger rect once it is open and measured, and
  // close on scroll/resize rather than tracking a moving anchor.
  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const trigger = triggerRef.current;
    const card = cardRef.current;
    if (!trigger || !card) return;

    const rect = trigger.getBoundingClientRect();
    const cardHeight = card.offsetHeight;
    const below = rect.bottom + GAP;
    const placeAbove = below + cardHeight > window.innerHeight && rect.top - GAP - cardHeight > 0;
    const top = placeAbove ? rect.top - GAP - cardHeight : below;
    const left = Math.min(Math.max(GAP, rect.left), window.innerWidth - CARD_WIDTH - GAP);
    setPosition({ top, left });

    const dismiss = () => setOpen(false);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  // Unknown id (typo or term not yet in the glossary): render plain text.
  if (!term) return <>{children ?? id}</>;

  const label = children ?? term.term;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="cursor-help border-b border-dotted border-fd-primary/50 font-medium text-fd-foreground transition-colors hover:border-fd-primary hover:text-fd-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
        aria-expanded={open}
        onMouseEnter={handleOpen}
        onMouseLeave={scheduleClose}
        onFocus={handleOpen}
        onBlur={scheduleClose}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        {label}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={cardRef}
              role="tooltip"
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              style={{
                position: "fixed",
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                width: CARD_WIDTH,
                maxWidth: "calc(100vw - 1rem)",
                opacity: position ? 1 : 0,
                zIndex: 50,
              }}
              className="not-prose rounded-lg border border-fd-border bg-fd-popover p-3 text-fd-popover-foreground shadow-lg"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-fd-foreground">{term.term}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-fd-muted-foreground">
                  {term.category}
                </span>
              </div>
              <p className="mt-1 text-sm text-fd-muted-foreground">{term.definition}</p>
              {term.code ? (
                <p className="mt-2 break-words font-mono text-[11px] text-fd-muted-foreground/80">{term.code}</p>
              ) : null}
              <a
                href={`/docs/vocabulary#${term.id}`}
                className="mt-2 inline-block text-xs font-medium text-fd-primary hover:underline"
              >
                Full vocabulary →
              </a>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
