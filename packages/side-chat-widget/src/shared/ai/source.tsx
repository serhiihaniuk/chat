import type { ButtonHTMLAttributes, HTMLAttributes, ReactElement } from "react";

import { cn } from "#shared/lib/cn";

export const Sources = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactElement => (
  <div
    aria-label="Sources"
    className={cn(
      "grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-4 pt-1",
      className,
    )}
    {...props}
  />
);

export const SourceLabel = ({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>): ReactElement => (
  <span className={cn("text-lg text-slate-500", className)} {...props} />
);

export const Source = ({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>): ReactElement => (
  <button
    className={cn(
      "mr-2 inline-flex min-h-10 items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 text-lg leading-none text-emerald-700 hover:bg-emerald-50",
      className,
    )}
    type={type}
    {...props}
  />
);
