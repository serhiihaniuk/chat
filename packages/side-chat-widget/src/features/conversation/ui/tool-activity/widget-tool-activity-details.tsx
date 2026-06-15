import { MessageResponse } from "#shared/ai/message";
import { omitUndefinedProperties } from "@side-chat/shared";

import type { WidgetActivityItem } from "#entities/chat";
import {
  displayEntries,
  isRecord,
  toDisplayLabel,
  ToolDisplayValue,
} from "./widget-tool-display-value.js";

export const ToolActivityDetails = ({
  item,
  sources,
}: {
  readonly item: WidgetActivityItem;
  readonly sources: readonly { readonly label: string; readonly url?: string }[];
}) => {
  const tool = item.details?.tool;
  if (!tool) return <p className="text-muted-foreground text-sm">No tool details available.</p>;

  const inputQuery = readStringField(tool.input, "query");
  const resultSummary = readStringField(tool.result, "summary");
  const resultCards = readResultCards(tool.result);
  const fallbackInput = inputQuery ? removeField(tool.input, "query") : tool.input;
  const fallbackResult = resultSummary || resultCards.length > 0 ? undefined : tool.result;

  return (
    <div className="space-y-4">
      {inputQuery && <ToolTextSection label="Search query">{inputQuery}</ToolTextSection>}
      {hasDisplayFields(fallbackInput) && (
        <ToolKeyValueSection label="Parameters" value={fallbackInput} />
      )}
      <ToolResultDetails
        fallbackResult={fallbackResult}
        item={item}
        resultCards={resultCards}
        resultSummary={resultSummary}
        tool={tool}
      />
      <SourceResults sources={resultCards.length > 0 ? [] : sources} />
    </div>
  );
};

export const readActivitySourceLabel = (source: {
  readonly label: string;
  readonly url?: string;
}): string => {
  if (!source.url) return source.label;

  try {
    return new URL(source.url).hostname;
  } catch {
    return source.label;
  }
};

const SourceResults = ({
  sources,
}: {
  readonly sources: readonly { readonly label: string; readonly url?: string }[];
}) => {
  if (sources.length === 0) return null;

  return (
    <section className="space-y-2">
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Sources</h4>
      <div className="grid gap-2">
        {sources.map((source) => (
          <SourceCard key={source.url ?? source.label} source={source} />
        ))}
      </div>
    </section>
  );
};

const ToolResultDetails = ({
  fallbackResult,
  item,
  resultCards,
  resultSummary,
  tool,
}: {
  readonly fallbackResult: unknown;
  readonly item: WidgetActivityItem;
  readonly resultCards: readonly ToolResultCard[];
  readonly resultSummary: string | undefined;
  readonly tool: WidgetActivityToolDetails;
}) => {
  if (tool.errorCode) {
    return (
      <ToolTextSection destructive label="Error">
        {tool.errorCode}
      </ToolTextSection>
    );
  }

  return (
    <>
      {resultSummary && <ToolTextSection label="Result">{resultSummary}</ToolTextSection>}
      {resultCards.length > 0 && <SearchResultCards results={resultCards} />}
      {hasDisplayFields(fallbackResult) && (
        <ToolKeyValueSection label="Result details" value={fallbackResult} />
      )}
      <MissingToolResult item={item} />
    </>
  );
};

const SearchResultCards = ({ results }: { readonly results: readonly ToolResultCard[] }) => (
  <section className="space-y-2">
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      Search results
    </h4>
    <div className="grid gap-2">
      {results.map((result) => (
        <a
          className="block rounded-md border border-border bg-muted/20 p-3 text-sm transition-colors hover:bg-muted/40"
          href={result.url}
          key={result.url ?? result.title}
          rel="noreferrer"
          target="_blank"
        >
          <span className="block font-medium text-foreground">{result.title}</span>
          {result.url && (
            <span className="mt-1 block text-muted-foreground text-xs">
              {readActivitySourceLabel({ label: result.title, url: result.url })}
            </span>
          )}
          {result.snippet && (
            <span className="mt-2 block text-muted-foreground leading-6">{result.snippet}</span>
          )}
        </a>
      ))}
    </div>
  </section>
);

const SourceCard = ({
  source,
}: {
  readonly source: { readonly label: string; readonly url?: string };
}) => {
  const content = (
    <>
      <span className="font-medium text-foreground">{source.label}</span>
      {source.url && (
        <span className="text-muted-foreground text-xs">{readActivitySourceLabel(source)}</span>
      )}
    </>
  );

  if (!source.url) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/20 p-3 text-sm">
        {content}
      </div>
    );
  }

  return (
    <a
      className="flex flex-col gap-1 rounded-md border border-border bg-muted/20 p-3 text-sm transition-colors hover:bg-muted/40"
      href={source.url}
      rel="noreferrer"
      target="_blank"
    >
      {content}
    </a>
  );
};

const ToolTextSection = ({
  children,
  destructive = false,
  label,
}: {
  readonly children: string;
  readonly destructive?: boolean;
  readonly label: string;
}) => (
  <section className="space-y-2">
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{label}</h4>
    <MessageResponse
      className={destructive ? "text-destructive text-sm" : "text-foreground text-sm"}
    >
      {children}
    </MessageResponse>
  </section>
);

const ToolKeyValueSection = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: unknown;
}) => {
  const entries = displayEntries(value);
  if (entries.length === 0) return null;

  return (
    <section className="space-y-2">
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{label}</h4>
      <dl className="grid gap-2 rounded-md border border-border bg-muted/20 p-3">
        {entries.map(([key, entry]) => (
          <div className="grid gap-1 text-sm" key={key}>
            <dt className="font-medium text-muted-foreground">{toDisplayLabel(key)}</dt>
            <dd className="break-words text-foreground">
              <ToolDisplayValue value={entry} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

const MissingToolResult = ({ item }: { readonly item: WidgetActivityItem }) => {
  const tool = item.details?.tool;
  if (item.status !== "completed" || tool?.result || tool?.errorCode) return null;

  return <p className="text-muted-foreground text-sm">No result payload was returned.</p>;
};

type ToolResultCard = {
  readonly title: string;
  readonly url?: string;
  readonly snippet?: string;
};

type WidgetActivityToolDetails = NonNullable<NonNullable<WidgetActivityItem["details"]>["tool"]>;

const readStringField = (value: unknown, key: string): string | undefined => {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" && field.trim().length > 0 ? field : undefined;
};

const readResultCards = (value: unknown): readonly ToolResultCard[] => {
  if (!isRecord(value) || !Array.isArray(value["results"])) return [];

  return value["results"].flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const title = typeof entry["title"] === "string" ? entry["title"].trim() : "";
    const url = typeof entry["url"] === "string" ? entry["url"].trim() : "";
    const snippet = typeof entry["snippet"] === "string" ? entry["snippet"].trim() : "";
    if (!title && !url && !snippet) return [];

    return [
      omitUndefinedProperties({
        title: title === "" ? readActivitySourceLabel({ label: "Source", url }) : title,
        url: url === "" ? undefined : url,
        snippet: snippet === "" ? undefined : snippet,
      }),
    ];
  });
};

const removeField = (value: unknown, fieldName: string): unknown => {
  if (!isRecord(value)) return value;
  const entries = Object.entries(value).filter(([key]) => key !== fieldName);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const hasDisplayFields = (value: unknown): boolean => displayEntries(value).length > 0;
