"use client";

/**
 * Tool detail row — the expandable form of the Tool row.
 *
 * Collapsed it looks exactly like `ToolRow` (status glyph + plain name) with a
 * trailing chevron; expanded it reveals what the call actually did: an optional
 * status line (host commands report `status · resultCode`), the input payload,
 * the result payload, and a distinct error line for failures. Rows without any
 * detail keep using the non-interactive `ToolRow`; this component only renders
 * when there is something to disclose.
 *
 * Same Base UI `Collapsible` contract as the Reasoning fold — the panel animates
 * from `--collapsible-panel-height`, never a JS measure.
 */
import { useState, type ReactElement } from "react";

import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown } from "lucide-react";

import { cn } from "#shared/lib/cn";
import { ToolGlyph, type ToolState } from "#shared/ui/tool-row";

/** Disclosable call detail; structurally matches the protocol's activity details. */
export type ToolDetail = {
  readonly input?: Readonly<Record<string, unknown>> | undefined;
  readonly result?: Readonly<Record<string, unknown>> | undefined;
  /** Host commands: `status · resultCode` once the host resolved the command. */
  readonly statusLine?: string | undefined;
  readonly errorCode?: string | undefined;
};

export const hasToolDetail = (detail: ToolDetail): boolean =>
  detail.input !== undefined ||
  detail.result !== undefined ||
  detail.statusLine !== undefined ||
  detail.errorCode !== undefined;

export function ToolDetailRow({
  name,
  state,
  detail,
  defaultOpen = false,
}: {
  readonly name: string;
  readonly state: ToolState;
  readonly detail: ToolDetail;
  readonly defaultOpen?: boolean;
}): ReactElement {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger
        data-slot="tool-detail-row"
        data-state={state}
        className="flex items-center gap-2"
      >
        <ToolGlyph state={state} />
        <span className="text-sm font-medium text-foreground">{name}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform ease-out",
            open && "rotate-180",
          )}
        />
      </Collapsible.Trigger>
      <Collapsible.Panel className="sc-collapsible-panel ml-1.5">
        <div className="flex flex-col gap-2 py-2 pl-3.5">
          {detail.statusLine && (
            <p className="text-xs text-muted-foreground">{detail.statusLine}</p>
          )}
          {detail.errorCode && (
            <p className="sc-error-glyph text-xs font-medium">{detail.errorCode}</p>
          )}
          {detail.input && <PayloadBlock label="Input" value={detail.input} />}
          {detail.result && <PayloadBlock label="Result" value={detail.result} />}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

const PayloadBlock = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: Readonly<Record<string, unknown>>;
}): ReactElement => (
  <div className="flex flex-col gap-(--tool-detail-gap) rounded-md bg-muted p-(--tool-detail-pad)">
    <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <PayloadObject entries={Object.entries(value)} depth={0} />
  </div>
);

// Tool payloads are arbitrary JSON; render them as a readable key/value tree
// rather than a raw `JSON.stringify` dump. Keys are humanized ("toolName" -> "Tool
// name"); primitives sit inline after their key, nested objects and arrays-of-
// objects indent beneath it. A depth cap stops a pathological payload from nesting
// without bound — past it, the subtree collapses to a one-line JSON string.
const MAX_PAYLOAD_DEPTH = 4;

// A single ultralong leaf (a giant query or result string) must not blow up the
// panel: clamp every leaf value to a few lines with an ellipsis. The full text
// stays reachable in the element's `title` tooltip. `whitespace-pre-wrap` keeps
// newlines inside the visible window; `break-words` wraps an unbroken run (a URL).
const LEAF_CLAMP = "line-clamp-4 whitespace-pre-wrap break-words";

const PayloadObject = ({
  entries,
  depth,
}: {
  readonly entries: readonly (readonly [string, unknown])[];
  readonly depth: number;
}): ReactElement => {
  if (entries.length === 0) return <PayloadEmpty />;
  return (
    <dl className="flex flex-col gap-(--tool-detail-gap)">
      {entries.map(([key, value]) => (
        <PayloadEntry key={key} label={humanizeKey(key)} value={value} depth={depth} />
      ))}
    </dl>
  );
};

const PayloadEntry = ({
  label,
  value,
  depth,
}: {
  readonly label: string;
  readonly value: unknown;
  readonly depth: number;
}): ReactElement => {
  const block = isBlockValue(value, depth);
  // A plain object carries its indent rule here; an array carries one rule per item
  // in PayloadList. Never both on the same value — that draws the doubled left line.
  const objectBlock = block && !Array.isArray(value);
  return (
    <div
      className={cn(
        "min-w-0 text-xs",
        block
          ? "flex flex-col gap-(--tool-detail-gap)"
          : "flex flex-wrap gap-x-(--tool-detail-gap)",
      )}
    >
      <dt className="shrink-0 font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-foreground",
          objectBlock && "border-l border-border pl-(--tool-detail-indent)",
        )}
      >
        <PayloadValue value={value} depth={depth + 1} />
      </dd>
    </div>
  );
};

const PayloadValue = ({
  value,
  depth,
}: {
  readonly value: unknown;
  readonly depth: number;
}): ReactElement => {
  if (value === null || value === undefined || value === "") return <PayloadEmpty />;
  if (typeof value === "string")
    return (
      <span title={value} className={LEAF_CLAMP}>
        {value}
      </span>
    );
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint")
    return <span>{String(value)}</span>;
  if (depth >= MAX_PAYLOAD_DEPTH)
    return <span className={LEAF_CLAMP}>{JSON.stringify(value)}</span>;
  if (Array.isArray(value)) return <PayloadList items={value} depth={depth} />;
  if (isRecord(value)) {
    return <PayloadObject entries={Object.entries(value)} depth={depth} />;
  }
  // A symbol or function — never present in a JSON tool payload.
  return <PayloadEmpty />;
};

const PayloadList = ({
  items,
  depth,
}: {
  readonly items: readonly unknown[];
  readonly depth: number;
}): ReactElement => {
  if (items.length === 0) return <PayloadEmpty />;
  if (items.every(isPrimitive)) {
    const joined = items.map(primitiveText).join(", ");
    return (
      <span title={joined} className={LEAF_CLAMP}>
        {joined}
      </span>
    );
  }
  return (
    <ul className="flex flex-col gap-(--tool-detail-gap)">
      {items.map((item, index) => (
        <li key={index} className="border-l border-border pl-(--tool-detail-indent)">
          <PayloadValue value={item} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
};

const PayloadEmpty = (): ReactElement => <span className="text-muted-foreground">—</span>;

const isPrimitive = (value: unknown): boolean =>
  value === null || (typeof value !== "object" && typeof value !== "function");

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Type-safe stringify for a primitive cell — never reaches Object's "[object
// Object]" default because the caller has already guarded to primitives.
const primitiveText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return value === null || value === undefined ? "—" : "";
};

// A value lays out as an indented block (label above, value beneath) when it has
// child rows to show: a non-empty object, or an array that contains objects.
const isBlockValue = (value: unknown, depth: number): boolean => {
  if (depth + 1 >= MAX_PAYLOAD_DEPTH) return false;
  if (Array.isArray(value)) return value.some((item) => !isPrimitive(item));
  return typeof value === "object" && value !== null && Object.keys(value).length > 0;
};

// "toolName" -> "Tool name", "result_code" -> "Result code".
const humanizeKey = (key: string): string => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
};
