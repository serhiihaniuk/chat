import type { HTMLAttributes, ReactElement } from "react";

import { cn } from "#shared/lib/cn";

export const Reasoning = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactElement => (
  <div
    className={cn("ml-[6.5rem] text-lg leading-7 text-slate-500", className)}
    {...props}
  />
);
