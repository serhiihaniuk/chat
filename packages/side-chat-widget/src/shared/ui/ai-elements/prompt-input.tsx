import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  FocusEvent,
  FormEvent,
  ReactNode,
} from "react";
import { forwardRef, useId, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils.js";

export function PromptInput({
  children,
  className,
  onSubmit,
}: {
  children: ReactNode;
  className?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className={cn(
        "shrink-0 px-8 pt-2 pb-4 max-sm:px-4 max-sm:pt-2 max-sm:pb-3",
        className,
      )}
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
        "min-h-14 w-full resize-none border-0 bg-transparent px-6 pt-2.5 pb-1.5 text-base leading-relaxed outline-none placeholder:text-slate-400 max-sm:min-h-12 max-sm:px-4 max-sm:pt-2",
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
        "flex items-center gap-2 px-5 pb-2.5 max-sm:px-3 max-sm:pb-2",
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
    <div className={cn("flex min-w-0 flex-1 items-center gap-1.5", className)}>
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
        "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-500 transition hover:text-slate-800 focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 max-sm:h-8 max-sm:px-2 [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function PromptInputModelSelect({
  defaultOpen = false,
  disabled,
  modelId,
  onModelChange,
  options,
}: {
  defaultOpen?: boolean;
  disabled?: boolean;
  modelId: string;
  onModelChange?: (modelId: string) => void;
  options?: ReadonlyArray<{ id: string; label: string; description?: string }>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const listboxId = useId();
  const modelOptions = options?.length ? options : [{ id: modelId, label: modelId }];
  const selectedModel =
    modelOptions.find((option) => option.id === modelId) ?? modelOptions[0];
  const closeIfFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
    }
  };

  return (
    <div className="relative" onBlur={closeIfFocusLeaves}>
      <button
        type="button"
        aria-label="Assistant model"
        aria-controls={listboxId}
        aria-expanded={open}
        className="inline-flex h-9 max-w-56 items-center gap-2 rounded-md px-3 text-base font-semibold text-slate-600 transition hover:bg-slate-500/5 hover:text-slate-900 focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 max-sm:h-8 max-sm:max-w-44 max-sm:px-2 max-sm:text-sm"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        style={{ outlineColor: "var(--sidechat-accent, rgb(37 99 235))" }}
      >
        <Sparkles aria-hidden="true" className="size-4 text-slate-400" />
        <span className="truncate">{selectedModel.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-slate-400 transition",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div
          className="absolute right-0 bottom-full z-50 mb-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-white py-1 shadow-xl"
          id={listboxId}
          role="listbox"
          style={{
            borderColor: "var(--sidechat-border, rgb(226 232 240))",
            boxShadow: "0 18px 48px rgb(15 23 42 / 0.18)",
          }}
        >
          <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Model selector
          </div>
          {modelOptions.map((option) => {
            const selected = option.id === modelId;
            return (
              <button
                type="button"
                aria-selected={selected}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                key={option.id}
                onClick={() => {
                  onModelChange?.(option.id);
                  setOpen(false);
                }}
                role="option"
              >
                <span
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]"
                  style={{
                    borderColor: selected
                      ? "var(--sidechat-accent, #059669)"
                      : "rgb(203 213 225)",
                    color: selected
                      ? "var(--sidechat-accent, #059669)"
                      : "rgb(148 163 184)",
                  }}
                >
                  {selected ? <Check aria-hidden="true" className="size-3" /> : ""}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {option.label}
                  </span>
                  {option.description ? (
                    <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
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
        "ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-white transition focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300 max-sm:size-9 [&_svg]:size-5",
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
