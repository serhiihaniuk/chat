import type { ComponentPropsWithoutRef, FormEvent, ReactNode } from "react";
import { forwardRef } from "react";

export function Composer({
  children,
  onSubmit,
}: {
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="shrink-0 bg-white px-8 pt-7 pb-8 max-sm:px-4 max-sm:pt-4 max-sm:pb-5"
      onSubmit={onSubmit}
    >
      <div className="relative">{children}</div>
    </form>
  );
}

export const ComposerInput = forwardRef<
  HTMLTextAreaElement,
  ComponentPropsWithoutRef<"textarea">
>(function ComposerInput(props, ref) {
  return (
    <textarea
      ref={ref}
      className={[
        "min-h-32 w-full resize-none rounded-lg border border-slate-200 bg-white px-6 py-5 pr-24 text-lg leading-relaxed text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/35 max-sm:min-h-24 max-sm:px-4 max-sm:py-3 max-sm:pr-16 max-sm:text-base",
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
      rows={3}
      {...props}
    />
  );
});
