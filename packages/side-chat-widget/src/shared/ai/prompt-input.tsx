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
      "mx-16 mb-8 flex flex-none flex-col rounded-lg border border-emerald-200 bg-white shadow-[0_8px_22px_rgba(16,24,40,0.06)] transition focus-within:ring-4 focus-within:ring-emerald-500/20 max-[720px]:mx-5 max-[720px]:mb-5",
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
      "block min-h-36 w-full resize-none border-0 bg-transparent px-8 pt-8 pb-3 text-[1.875rem] leading-snug text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-65 max-[720px]:min-h-24 max-[720px]:px-5 max-[720px]:pt-5 max-[720px]:text-lg",
      className,
    )}
    rows={2}
    {...props}
  />
);

export const PromptInputToolbar = ({
  className,
  ...props
}: PromptInputToolbarProps): ReactElement => (
  <div
    className={cn(
      "flex items-center justify-between gap-5 px-8 pb-5 max-[720px]:px-5",
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
      "inline-flex size-20 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300 max-[720px]:size-12 [&_svg]:size-11 max-[720px]:[&_svg]:size-6",
      className,
    )}
    disabled={disabled}
    type={type}
    {...props}
  >
    {children}
  </button>
);
