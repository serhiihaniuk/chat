/**
 * Design-system showcase.
 *
 * The bundled `design_widget.html` owns the document chrome, section prose,
 * behavior notes, and token tables. This React layer keeps that page as the
 * base and injects our real component demos into the original demo cards.
 */
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { SideChatWidgetRoot } from "#shared/ui/widget-root";

import { sections, type ShowcaseSection } from "./showcase-sections.js";

const DESIGN_WIDGET_URL = new URL("../../../../design_widget.html", import.meta.url);

const DESIGN_INJECTION_SLOTS: readonly { sectionId: string; designSectionId: string }[] = [
  { sectionId: "row", designSectionId: "c-row" },
  { sectionId: "field", designSectionId: "c-text" },
  { sectionId: "button", designSectionId: "c-button" },
  { sectionId: "switch", designSectionId: "c-toggle" },
  { sectionId: "segmented", designSectionId: "c-tabs" },
  { sectionId: "menu", designSectionId: "c-menu" },
  { sectionId: "badge", designSectionId: "c-badge" },
  { sectionId: "scroll-area", designSectionId: "c-scroll" },
  { sectionId: "shell", designSectionId: "c-panel" },
  { sectionId: "sidebar-rail", designSectionId: "c-rail" },
  { sectionId: "conversation-item", designSectionId: "c-convo" },
  { sectionId: "conversation-grouping", designSectionId: "c-group" },
  { sectionId: "message", designSectionId: "c-message" },
  { sectionId: "message-actions", designSectionId: "c-actions" },
  { sectionId: "composer", designSectionId: "c-composer" },
  { sectionId: "tools-menu", designSectionId: "c-tools" },
  { sectionId: "model-selector", designSectionId: "c-model" },
  { sectionId: "reasoning", designSectionId: "c-reason" },
  { sectionId: "error-notice", designSectionId: "c-error" },
  { sectionId: "settings", designSectionId: "c-settings" },
  { sectionId: "markdown", designSectionId: "c-markdown" },
];

type InjectionTarget = {
  readonly container: HTMLElement;
  readonly section: ShowcaseSection;
};

export function ComponentShowcase() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const waitTimerRef = useRef<number | null>(null);
  const [targets, setTargets] = useState<readonly InjectionTarget[]>([]);

  const prepareFrame = useCallback(() => {
    if (waitTimerRef.current !== null) {
      window.clearInterval(waitTimerRef.current);
      waitTimerRef.current = null;
    }

    waitTimerRef.current = window.setInterval(() => {
      const frameDocument = iframeRef.current?.contentDocument;
      if (!frameDocument) {
        return;
      }

      if (!frameDocument.getElementById("c-row")) {
        return;
      }

      if (waitTimerRef.current !== null) {
        window.clearInterval(waitTimerRef.current);
        waitTimerRef.current = null;
      }

      copyWidgetStylesIntoFrame(frameDocument);
      setTargets(createInjectionTargets(frameDocument));
    }, 100);
  }, []);

  useEffect(() => {
    return () => {
      if (waitTimerRef.current !== null) {
        window.clearInterval(waitTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="h-screen bg-background">
      <iframe
        ref={iframeRef}
        title="Side Chat design system"
        src={DESIGN_WIDGET_URL.href}
        onLoad={prepareFrame}
        className="block h-full w-full border-0 bg-background"
      />

      {targets.map((target) =>
        createPortal(
          <SideChatWidgetRoot className="block">
            <SectionBoundary id={target.section.id}>{target.section.node}</SectionBoundary>
          </SideChatWidgetRoot>,
          target.container,
          target.section.id,
        ),
      )}
    </div>
  );
}

function copyWidgetStylesIntoFrame(frameDocument: Document) {
  frameDocument
    .querySelectorAll("[data-sidechat-copied-style]")
    .forEach((node) => node.parentElement?.removeChild(node));

  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    const clone = node.cloneNode(true);
    if (clone instanceof HTMLElement) {
      clone.dataset["sidechatCopiedStyle"] = "true";
      if (clone instanceof HTMLLinkElement && node instanceof HTMLLinkElement) {
        clone.href = node.href;
      }
      frameDocument.head.appendChild(clone);
    }
  });
}

function createInjectionTargets(frameDocument: Document): readonly InjectionTarget[] {
  return DESIGN_INJECTION_SLOTS.flatMap((slot) => {
    const section = sections.find((candidate) => candidate.id === slot.sectionId);
    const designSection = frameDocument.getElementById(slot.designSectionId);
    const demoCard = designSection ? findDemoCard(designSection) : null;

    if (!section || !demoCard) {
      return [];
    }

    demoCard.replaceChildren();
    demoCard.dataset["sidechatRealDemo"] = section.id;
    return [{ container: demoCard, section }];
  });
}

function findDemoCard(section: HTMLElement): HTMLElement | null {
  return (
    Array.from(section.children).find(
      (child): child is HTMLElement =>
        child.nodeType === child.ELEMENT_NODE &&
        (child.getAttribute("style") ?? "").includes("var(--sc-canvas)"),
    ) ?? null
  );
}

/** Isolates each injected section so one crashing component cannot blank the page. */
class SectionBoundary extends Component<
  { id: string; children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[showcase] section "${this.props.id}" crashed:`, error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="rounded-md border border-destructive bg-muted p-3">
          <p className="text-sm font-semibold text-foreground">Render error in "{this.props.id}"</p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
