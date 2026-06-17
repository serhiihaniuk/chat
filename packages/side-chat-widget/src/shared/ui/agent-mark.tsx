import { cn } from "#shared/lib/cn";
import { useId, type ComponentProps } from "react";

const AGENT_MARK_BUBBLE_PATH =
  "M 7 3 h 10 a 4 4 0 0 1 4 4 v 8 a 4 4 0 0 1 -4 4 h -5 l -4 4 v -4 h -1 a 4 4 0 0 1 -4 -4 v -8 a 4 4 0 0 1 4 -4 Z";

// Side Chat brand mark: a solid conversation bubble with a trend line cut out
// of the fill. It uses currentColor so theme tokens choose the mark color.
export const AgentMark = ({ className, ...props }: ComponentProps<"svg">) => {
  const trendCutoutMaskId = `agent-mark-trend-cutout-${useId().replaceAll(":", "")}`;

  return (
    <svg
      aria-hidden="true"
      className={cn("size-4", className)}
      fill="currentColor"
      viewBox="0 0 24 24"
      {...props}
    >
      <defs>
        <mask height="24" id={trendCutoutMaskId} maskUnits="userSpaceOnUse" width="24" x="0" y="0">
          <rect fill="white" height="24" width="24" />
          <g
            fill="none"
            stroke="black"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          >
            <path d="M 6.5 14 L 10 10.5 L 12.5 13 L 17.5 8" />
            <path d="M 13.5 8 H 17.5 V 12" />
          </g>
        </mask>
      </defs>
      <path d={AGENT_MARK_BUBBLE_PATH} mask={`url(#${trendCutoutMaskId})`} />
    </svg>
  );
};
