import { MessageResponse } from "#shared/ai/message";

export const ToolDisplayValue = ({ value }: { readonly value: unknown }) => {
  if (typeof value === "string")
    return <MessageResponse className="text-sm">{value}</MessageResponse>;
  if (typeof value === "number" || typeof value === "boolean") return <span>{String(value)}</span>;
  if (value === null) return <span className="text-muted-foreground">None</span>;
  if (Array.isArray(value)) return <ToolDisplayList items={value as readonly unknown[]} />;
  if (isRecord(value)) return <ToolDisplayRecord value={value} />;
  return <span className="text-muted-foreground">Structured value</span>;
};

export const displayEntries = (value: unknown): readonly (readonly [string, unknown])[] => {
  if (!isRecord(value)) return [];
  return Object.entries(value).filter(([, entry]) => entry !== undefined);
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const toDisplayLabel = (key: string): string =>
  key
    .replace(/[_-]+/gu, " ")
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());

const ToolDisplayList = ({ items }: { readonly items: readonly unknown[] }) => {
  if (items.length === 0) return <span className="text-muted-foreground">None</span>;

  return (
    <ul className="list-disc space-y-1 ps-5">
      {items.map((entry, index) => (
        <li key={index}>
          <ToolDisplayValue value={entry} />
        </li>
      ))}
    </ul>
  );
};

const ToolDisplayRecord = ({ value }: { readonly value: Record<string, unknown> }) => {
  const entries = displayEntries(value);
  if (entries.length === 0) return <span className="text-muted-foreground">None</span>;

  return (
    <dl className="grid gap-1.5">
      {entries.map(([key, entry]) => (
        <div className="grid gap-0.5" key={key}>
          <dt className="font-medium text-muted-foreground">{toDisplayLabel(key)}</dt>
          <dd>
            <ToolDisplayValue value={entry} />
          </dd>
        </div>
      ))}
    </dl>
  );
};
