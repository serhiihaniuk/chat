import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";

import { cn } from "#shared/lib/cn";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string;
  readonly icon: ReactNode;
};

export const IconButton = ({
  className,
  icon,
  label,
  title,
  type = "button",
  ...props
}: IconButtonProps): ReactElement => (
  <button
    aria-label={label}
    className={cn(
      "side-chat-icon-button inline-flex size-11 items-center justify-center rounded-lg border-0 bg-transparent text-inherit hover:bg-emerald-50 hover:text-emerald-700",
      className,
    )}
    title={title ?? label}
    type={type}
    {...props}
  >
    <span
      aria-hidden="true"
      className="side-chat-icon-button__glyph [&_svg]:size-7 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2"
    >
      {icon}
    </span>
  </button>
);
