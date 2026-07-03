"use client";

/**
 * Tool detail row — the expandable form of the §9.9 tool row.
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
  <div className="flex flex-col gap-1">
    <span className="text-2xs font-semibold text-muted-foreground">{label}</span>
    <pre className="overflow-x-auto rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  </div>
);

export function ToolDetailSection(): ReactElement {
  return (
    <div className="flex flex-col gap-2.5">
      <ToolDetailRow
        defaultOpen
        detail={{
          input: { query: "current portfolio news" },
          result: { summary: "Found 3 briefing-style results." },
        }}
        name="Search web"
        state="success"
      />
      <ToolDetailRow
        detail={{ statusLine: "applied · resource_opened", input: { resourceId: "ticket-4821" } }}
        name="Open resource"
        state="success"
      />
      <ToolDetailRow
        detail={{ errorCode: "tool_failed", input: { path: "/reports/q4" } }}
        name="Read file"
        state="error"
      />
    </div>
  );
}
