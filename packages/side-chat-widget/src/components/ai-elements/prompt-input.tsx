import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  FormEvent,
  ReactNode,
} from "react";
import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils.js";

export function PromptInput({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="shrink-0 px-8 pt-6 pb-8 max-sm:px-4 max-sm:pt-4 max-sm:pb-5"
      onSubmit={onSubmit}
      style={{ background: "var(--sidechat-bg, white)" }}
    >
      <div
        className="rounded-lg border shadow-sm transition focus-within:ring-4"
        style={{
          background: "var(--sidechat-bg, white)",
          borderColor: "var(--sidechat-border, rgb(226 232 240))",
          outlineColor: "var(--sidechat-accent, rgb(37 99 235))",
          boxShadow: "0 1px 2px rgb(15 23 42 / 0.08)",
          "--tw-ring-color":
            "color-mix(in srgb, var(--sidechat-accent, #2563eb) 28%, transparent)",
        } as CSSProperties}
      >
        {children}
      </div>
    </form>
  );
}

export const PromptInputTextarea = forwardRef<
  HTMLTextAreaElement,
  ComponentPropsWithoutRef<"textarea">
>(function PromptInputTextarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full resize-none border-0 bg-transparent px-6 pt-5 pb-3 text-lg leading-relaxed outline-none placeholder:text-slate-400 max-sm:min-h-20 max-sm:px-4 max-sm:pt-4 max-sm:text-base",
        className,
      )}
      rows={2}
      {...props}
    />
  );
});

export function PromptInputToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-5 pb-4 max-sm:px-3 max-sm:pb-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PromptInputTools({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2", className)}>
      {children}
    </div>
  );
}

export function PromptInputButton({
  className,
  ...props
}: ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md px-3 text-base font-semibold text-slate-500 transition hover:text-slate-800 focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 max-sm:h-9 max-sm:px-2 max-sm:text-sm [&_svg]:size-5",
        className,
      )}
      {...props}
    />
  );
}

export function PromptInputModelSelect({
  modelId,
}: {
  modelId: string;
}) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-lg font-semibold text-slate-600 max-sm:h-9 max-sm:px-2 max-sm:text-base">
      <span className="sr-only">Model</span>
      <select
        aria-label="Assistant model"
        className="max-w-44 appearance-none border-0 bg-transparent pr-5 font:inherit text-inherit outline-none disabled:cursor-not-allowed disabled:opacity-100"
        disabled
        value={modelId}
      >
        <option value={modelId}>{modelId}</option>
      </select>
      <ChevronDown aria-hidden="true" className="-ml-6 size-4 text-slate-400" />
    </label>
  );
}

export function PromptInputSubmit({
  className,
  ...props
}: ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="submit"
      className={cn(
        "ml-auto inline-flex size-12 shrink-0 items-center justify-center rounded-lg text-white transition focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300 max-sm:size-10 [&_svg]:size-6",
        className,
      )}
      style={{
        background: props.disabled
          ? undefined
          : "var(--sidechat-accent, rgb(37 99 235))",
        outlineColor: "var(--sidechat-accent, rgb(37 99 235))",
      }}
      {...props}
    />
  );
}
