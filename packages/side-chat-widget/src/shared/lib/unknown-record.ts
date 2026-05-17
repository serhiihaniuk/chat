export type UnknownRecord = Record<string, unknown>;

export const isUnknownRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const readString = (
  record: UnknownRecord,
  field: string,
): string | undefined => {
  const value = record[field];
  if (typeof value !== "string") return undefined;
  return value;
};
