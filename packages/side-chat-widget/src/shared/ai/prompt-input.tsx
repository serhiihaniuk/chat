import type {
  ButtonHTMLAttributes,
  FormHTMLAttributes,
  HTMLAttributes,
  ReactElement,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "#shared/lib/cn";

export type PromptInputProps = FormHTMLAttributes<HTMLFormElement>;
export type PromptInputTextareaProps =
  TextareaHTMLAttributes<HTMLTextAreaElement>;
export type PromptInputToolbarProps = HTMLAttributes<HTMLDivElement>;
export type PromptInputSubmitProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const PromptInput = ({
  className,
  ...props
}: PromptInputProps): ReactElement => (
  <form
    className={cn(
      "mx-16 mb-8 flex flex-none flex-col rounded-lg border border-emerald-200 bg-white shadow-[0_8px_22px_rgba(16,24,40,0.06)]",
      className,
    )}
    {...props}
  />
);

export const PromptInputTextarea = ({
  className,
  ...props
}: PromptInputTextareaProps): ReactElement => (
  <textarea
    className={cn(
      "block min-h-28 w-full resize-none border-0 bg-transparent px-8 pt-7 pb-3 text-[1.625rem] leading-snug text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-65",
      className,
    )}
    {...props}
  />
);

export const PromptInputToolbar = ({
  className,
  ...props
}: PromptInputToolbarProps): ReactElement => (
  <div
    className={cn(
      "flex items-center justify-between gap-5 px-8 pb-5",
      className,
    )}
    {...props}
  />
);

export const PromptInputSubmit = ({
  children = "Send",
  className,
  disabled,
  type = "submit",
  ...props
}: PromptInputSubmitProps): ReactElement => (
  <button
    className={cn(
      "inline-flex min-h-16 min-w-20 items-center justify-center rounded-lg bg-emerald-700 px-5 text-base font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400",
      className,
    )}
    disabled={disabled}
    type={type}
    {...props}
  >
    {children}
  </button>
);
