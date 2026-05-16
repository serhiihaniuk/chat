import { Schema } from "effect";

import {
  HostCommandSchema,
  SidechatRequestSchema,
  SidechatStreamEventSchema,
} from "./schemas.js";
import {
  SidechatRequestHeadersSchema,
  SidechatStreamResponseHeadersSchema,
} from "./contracts.js";
import type {
  HostCommand,
  SidechatRequest,
  SidechatStreamEvent,
} from "./types.js";

/**
 * Boundary callers need two styles: parse* for fail-fast internal code and
 * validate* for adapters that must turn invalid input into protocol errors.
 */
export interface SidechatValidationIssue {
  readonly message: string;
}

export type SidechatValidationResult<T> =
  | ({ ok: true } & { data: T })
  | ({ ok: false } & { issues: SidechatValidationIssue[] });

const toIssue = (error: unknown): SidechatValidationIssue => ({
  message:
    Schema.isSchemaError(error) || error instanceof Error
      ? error.message
      : "Invalid sidechat protocol value",
});

const decodeWith = <S extends Schema.Decoder<unknown>>(
  schema: S,
  value: unknown,
): SidechatValidationResult<S["Type"]> => {
  try {
    return { ok: true, data: Schema.decodeUnknownSync(schema)(value) };
  } catch (error) {
    return { ok: false, issues: [toIssue(error)] };
  }
};

export const parseSidechatRequest = (value: unknown): SidechatRequest =>
  Schema.decodeUnknownSync(SidechatRequestSchema)(value);

export const parseSidechatStreamEvent = (
  value: unknown,
): SidechatStreamEvent =>
  Schema.decodeUnknownSync(SidechatStreamEventSchema)(value);

export const parseHostCommand = (value: unknown): HostCommand =>
  Schema.decodeUnknownSync(HostCommandSchema)(value);

export const parseSidechatRequestHeaders = (value: unknown) =>
  Schema.decodeUnknownSync(SidechatRequestHeadersSchema)(value);

export const parseSidechatResponseHeaders = (value: unknown) =>
  Schema.decodeUnknownSync(SidechatStreamResponseHeadersSchema)(value);

export const validateRequest = (
  value: unknown,
): SidechatValidationResult<SidechatRequest> =>
  decodeWith(SidechatRequestSchema, value);

export const validateStreamEvent = (
  value: unknown,
): SidechatValidationResult<SidechatStreamEvent> =>
  decodeWith(SidechatStreamEventSchema, value);

export const validateHostCommand = (
  value: unknown,
): SidechatValidationResult<HostCommand> => decodeWith(HostCommandSchema, value);

export const validateRequestHeaders = (value: Record<string, string>) =>
  decodeWith(SidechatRequestHeadersSchema, value);

export const validateResponseHeaders = (value: Record<string, string>) =>
  decodeWith(SidechatStreamResponseHeadersSchema, value);

export const validateEvents = (events: SidechatStreamEvent[]) => {
  for (const event of events) {
    const parsed = validateStreamEvent(event);
    if (!parsed.ok) {
      return { ok: false as const, issues: parsed.issues };
    }
  }

  return { ok: true as const };
};
