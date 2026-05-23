import type { HTMLAttributes, ReactElement, ReactNode } from "react";

import { Badge } from "#shared/ui/badge";
import { cn } from "#shared/lib/cn";

export type ToolProps = HTMLAttributes<HTMLDivElement> & {
  readonly label: string;
  readonly status: ReactNode;
};

export const Tool = ({
  className,
  label,
  status,
  ...props
}: ToolProps): ReactElement => (
  <div
    className={cn(
      "ml-[6.5rem] flex max-w-[58rem] items-center gap-3 text-lg leading-7 text-slate-600",
      className,
    )}
    {...props}
  >
    <span>{label}</span>
    <Badge>{status}</Badge>
  </div>
);
