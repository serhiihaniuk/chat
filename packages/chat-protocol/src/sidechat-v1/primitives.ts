import { SIDECHAT_PROTOCOL_VERSION, type SidechatProtocolVersion } from "./version.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export type SidechatId = string;

export type ProtocolEnvelope = {
  readonly protocolVersion: SidechatProtocolVersion;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const requireString = (
  record: Record<string, unknown>,
  key: string,
  context: string,
): string => {
  const value = readString(record, key);
  if (!value) throw new Error(`${context}.${key} must be a non-empty string`);
  return value;
};

export const assertProtocolVersion = (value: unknown, context: string): SidechatProtocolVersion => {
  if (value !== SIDECHAT_PROTOCOL_VERSION) {
    throw new Error(`${context}.protocolVersion must be ${SIDECHAT_PROTOCOL_VERSION}`);
  }
  return SIDECHAT_PROTOCOL_VERSION;
};
