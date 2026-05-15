"use client";

import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";
import type { TokenUsage } from "@side-chat/shared-protocol";
import { cn } from "../../lib/utils.js";

type ContextUsageValue = {
  maxTokens: number;
  usedTokens: number;
  label?: string;
  description?: string;
  usage?: TokenUsage;
  usageLabel?: string;
};

const ContextUsage = createContext<ContextUsageValue | undefined>(undefined);

const useContextUsage = () => {
  const value = useContext(ContextUsage);
  if (!value) {
    throw new Error("Context components must be used inside <Context>");
  }
  return value;
};

const formatCompact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value < 0.01 ? 4 : 2,
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    style: "currency",
  }).format(value);

const getPercent = (usedTokens: number, maxTokens: number) =>
  maxTokens > 0 ? Math.min(100, Math.round((usedTokens / maxTokens) * 100)) : 0;

const estimateTokensFromCharacters = (characters: number) =>
  Math.max(0, Math.ceil(characters / 4));

export type ContextProps = ComponentProps<"div"> & ContextUsageValue;

export function Context({
  maxTokens,
  usedTokens,
  label,
  description,
  usage,
  usageLabel,
  className,
  children,
  ...props
}: ContextProps) {
  return (
    <ContextUsage.Provider
      value={{
        maxTokens,
        usedTokens,
        label,
        description,
        usage,
        usageLabel,
      }}
    >
      <div className={cn("group/context relative inline-flex", className)} {...props}>
        {children}
      </div>
    </ContextUsage.Provider>
  );
}

export function ContextTrigger({
  className,
  children,
  ...props
}: ComponentProps<"button">) {
  const { maxTokens, usedTokens, label } = useContextUsage();
  const percent = getPercent(usedTokens, maxTokens);
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percent / 100) * circumference;

  return (
    <button
      type="button"
      aria-label={`Context usage ${percent}%`}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:outline-none max-sm:h-9 max-sm:px-2",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <span>{label ?? "Context"}</span>
          <span>{percent}%</span>
          <svg aria-hidden="true" className="size-5 -rotate-90" viewBox="0 0 20 20">
            <circle
              cx="10"
              cy="10"
              fill="none"
              r={radius}
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="2"
            />
            <circle
              cx="10"
              cy="10"
              fill="none"
              r={radius}
              stroke="currentColor"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              strokeWidth="2"
            />
          </svg>
        </>
      )}
    </button>
  );
}

export function ContextContent({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-96 max-w-[calc(100vw-3rem)] rounded-md border border-border bg-white p-3 text-sm text-slate-700 shadow-lg group-hover/context:block group-focus-within/context:block",
        className,
      )}
      role="tooltip"
      {...props}
    >
      {children}
    </div>
  );
}

export function ContextContentHeader({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  const { maxTokens, usedTokens } = useContextUsage();
  const percent = getPercent(usedTokens, maxTokens);

  return (
    <div className={cn("mb-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center justify-between gap-3">
            <strong className="text-sm text-slate-900">Context usage</strong>
            <span className="font-semibold text-slate-600">{percent}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function ContextContentBody({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  const { maxTokens, usedTokens, description, usage, usageLabel } =
    useContextUsage();
  const estimatedVisibleTokens = estimateTokensFromCharacters(usedTokens);
  const estimatedBudgetTokens = estimateTokensFromCharacters(maxTokens);

  return (
    <div className={cn("space-y-2", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center justify-between gap-3">
            <span>Visible context</span>
            <span className="font-semibold">
              {formatCompact(usedTokens)} / {formatCompact(maxTokens)} chars
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>Approx. context tokens</span>
            <span className="font-semibold text-slate-600">
              {formatCompact(estimatedVisibleTokens)} /{" "}
              {formatCompact(estimatedBudgetTokens)}
            </span>
          </div>
          <div className="mt-3 border-t border-border pt-2">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-900">
                {usageLabel ?? "Conversation usage"}
              </span>
              <span className="text-xs text-slate-500">
                {usage ? `${formatNumber(usage.totalTokens)} total` : "No usage yet"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="rounded bg-slate-50 px-2 py-1">
                <span className="block text-[10px] uppercase text-slate-500">
                  Input
                </span>
                <span className="font-semibold">
                  {usage ? formatCompact(usage.inputTokens) : "-"}
                </span>
              </span>
              <span className="rounded bg-slate-50 px-2 py-1">
                <span className="block text-[10px] uppercase text-slate-500">
                  Output
                </span>
                <span className="font-semibold">
                  {usage ? formatCompact(usage.outputTokens) : "-"}
                </span>
              </span>
              <span className="rounded bg-slate-50 px-2 py-1">
                <span className="block text-[10px] uppercase text-slate-500">
                  Total
                </span>
                <span className="font-semibold">
                  {usage ? formatCompact(usage.totalTokens) : "-"}
                </span>
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <span className="rounded bg-slate-50 px-2 py-1">
                <span className="block text-[10px] uppercase text-slate-500">
                  Reasoning
                </span>
                <span className="font-semibold">
                  {usage?.reasoningTokens !== undefined
                    ? formatCompact(usage.reasoningTokens)
                    : "-"}
                </span>
              </span>
              <span className="rounded bg-slate-50 px-2 py-1">
                <span className="block text-[10px] uppercase text-slate-500">
                  Cache read
                </span>
                <span className="font-semibold">
                  {usage?.cachedInputTokens !== undefined
                    ? formatCompact(usage.cachedInputTokens)
                    : "-"}
                </span>
              </span>
              <span className="rounded bg-slate-50 px-2 py-1">
                <span className="block text-[10px] uppercase text-slate-500">
                  Cost
                </span>
                <span className="font-semibold">
                  {usage?.estimatedCostUsd !== undefined
                    ? formatUsd(usage.estimatedCostUsd)
                    : "-"}
                </span>
              </span>
            </div>
          </div>
          {description ? (
            <p className="m-0 text-xs leading-relaxed text-slate-500">
              {description}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function ContextContentFooter({
  className,
  children,
  ...props
}: ComponentProps<"div"> & { children?: ReactNode }) {
  return (
    <div
      className={cn(
        "mt-3 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-500",
        className,
      )}
      {...props}
    >
      {children ?? "Hidden system instructions and backend context are not shown."}
    </div>
  );
}
