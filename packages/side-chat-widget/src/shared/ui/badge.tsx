import type { HTMLAttributes, ReactElement } from "react";

import { cn } from "#shared/lib/cn";

export type BadgeProps = HTMLAttributes<HTMLSpanElement>;

export const Badge = ({ className, ...props }: BadgeProps): ReactElement => (
  <span
    className={cn(
      "inline-flex min-h-7 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-sm font-medium text-emerald-800",
      className,
    )}
    {...props}
  />
);
