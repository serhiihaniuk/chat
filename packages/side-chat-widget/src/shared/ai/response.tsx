import type { HTMLAttributes, ReactElement } from "react";

import { cn } from "#shared/lib/cn";

export type ResponseProps = HTMLAttributes<HTMLDivElement>;

export const Response = ({
  className,
  ...props
}: ResponseProps): ReactElement => (
  <div
    className={cn(
      "max-w-[58rem] whitespace-pre-wrap text-[1.625rem] leading-[1.45] tracking-normal text-slate-950",
      className,
    )}
    {...props}
  />
);
