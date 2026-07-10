import { isRecord } from "@side-chat/shared";

/** Parse a test HTTP response while preserving the same unknown-to-object guard as production. */
export const readJsonResponseObject = async (
  response: Response,
): Promise<Record<string, unknown>> => requireJsonObject(await response.json(), "response body");

export const requireJsonObject = (value: unknown, label: string): Record<string, unknown> => {
  if (isRecord(value)) return value;
  throw new Error(`Expected ${label} to be a JSON object.`);
};

export const requireJsonArray = (value: unknown, label: string): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  throw new Error(`Expected ${label} to be a JSON array.`);
};

export const requireString = (value: unknown, label: string): string => {
  if (typeof value === "string") return value;
  throw new Error(`Expected ${label} to be a string.`);
};
