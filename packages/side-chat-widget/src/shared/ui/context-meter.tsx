/**
 * Context meter: show real context-window usage.
 *
 * The meter compares token usage from the last completed turn
 * (`sidechat.completed`.usage) with the active model's context window. It renders
 * nothing until both values are known, so it never invents a percentage from
 * character counts.
 *
 * For accessibility, the ring is `role="meter"` with an ARIA label and value
 * text. A Base UI tooltip shows “used / window tokens” on hover. The SVG is
 * `aria-hidden` so the value is announced only once.
 */
import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";

import { usePortalContainer } from "#shared/ui/widget-root";

const RING_R = 6.5;
const RING_C = 2 * Math.PI * RING_R;
const TOOLTIP_POPUP_CLASS =
  "rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground border border-border shadow-(--shadow-popover) starting:opacity-0 ending:opacity-0";

export function ContextMeter({
  usedTokens,
  windowTokens,
}: {
  readonly usedTokens?: number | undefined;
  readonly windowTokens?: number | undefined;
}): ReactElement | null {
  const container = usePortalContainer();
  const fill = resolveContextFill(usedTokens, windowTokens);
  if (fill === undefined) return null;

  // Self-contained Provider: the composer has no Tooltip.Provider ancestor, so the
  // meter owns its own hover delay rather than depending on one.
  return (
    <Tooltip.Provider delay={300}>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <span
              aria-label="Context used"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={fill.percent}
              aria-valuetext={fill.label}
              className="sc-context-ring shrink-0"
              role="meter"
            >
              <ContextRing percent={fill.percent} />
            </span>
          }
        />
        <Tooltip.Portal container={container}>
          <Tooltip.Positioner sideOffset={6}>
            <Tooltip.Popup data-slot="tooltip-content" className={TOOLTIP_POPUP_CLASS}>
              {fill.label}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

type ContextFill = { readonly percent: number; readonly label: string };

const resolveContextFill = (
  usedTokens: number | undefined,
  windowTokens: number | undefined,
): ContextFill | undefined => {
  if (usedTokens === undefined || windowTokens === undefined) return undefined;
  if (windowTokens <= 0 || usedTokens < 0) return undefined;
  const percent = Math.max(0, Math.min(100, Math.round((usedTokens / windowTokens) * 100)));
  const label = `${usedTokens.toLocaleString()} / ${windowTokens.toLocaleString()} tokens (${percent}%)`;
  return { percent, label };
};

// The SVG is decorative (the wrapping span carries the meter role): a track circle
// plus an indicator whose `stroke-dashoffset` maps 0–100% to full–empty arc.
function ContextRing({ percent }: { readonly percent: number }): ReactElement {
  return (
    <svg aria-hidden className="block" fill="none" height={18} viewBox="0 0 18 18" width={18}>
      <circle className="sc-context-ring-track" cx={9} cy={9} r={RING_R} strokeWidth={2.4} />
      <circle
        className="sc-context-ring-indicator"
        cx={9}
        cy={9}
        r={RING_R}
        strokeDasharray={RING_C}
        strokeLinecap="round"
        strokeWidth={2.4}
        style={{ strokeDashoffset: RING_C * (1 - percent / 100) }}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}
