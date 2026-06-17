import { cn } from "#shared/lib/cn";
import { ScanIcon } from "lucide-react";
import type { ComponentProps } from "react";

// Side Chat uses Lucide's scan glyph as the product mark so the widget reads as
// a focused assistant surface without carrying a custom pictogram.
export const AgentMark = ({ className, ...props }: ComponentProps<typeof ScanIcon>) => (
  <ScanIcon aria-hidden="true" className={cn("size-4", className)} strokeWidth={2.15} {...props} />
);
