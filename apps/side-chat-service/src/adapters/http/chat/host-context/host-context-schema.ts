import { z } from "zod";

import type { HostContext, HostContextLimits, HostContextMetadata } from "#domain/host-context";

type MetadataBudget = { entries: number };

/** Validate untrusted host page data without logging or retaining the rejected value. */
export function parseHostContext(
  candidate: unknown,
  limits: HostContextLimits,
): HostContext | undefined {
  const parsed = hostContextSchema(limits).safeParse(candidate);
  if (!parsed.success) return undefined;

  const metadata = parsed.data.metadata;
  if (metadata !== undefined && !isBoundedMetadata(metadata, limits)) return undefined;

  const hostContext: HostContext = {
    schemaVersion: parsed.data.schemaVersion,
    origin: parsed.data.origin,
    url: parsed.data.url,
    title: parsed.data.title,
    metadata,
  };
  return serializedByteLength(hostContext) <= limits.maxSerializedBytes ? hostContext : undefined;
}

function hostContextSchema(limits: HostContextLimits) {
  const boundedString = z.string().max(limits.maxStringLength);
  return z
    .object({
      schemaVersion: boundedString.refine((value) => value.trim().length > 0),
      origin: boundedString.optional(),
      url: boundedString.optional(),
      title: boundedString.optional(),
      metadata: z.unknown().optional(),
    })
    .strict();
}

function isBoundedMetadata(
  value: unknown,
  limits: HostContextLimits,
): value is HostContextMetadata {
  if (!isRecord(value)) return false;
  return isBoundedObject(value, 1, { entries: 0 }, limits);
}

function isBoundedValue(
  value: unknown,
  containerDepth: number,
  budget: MetadataBudget,
  limits: HostContextLimits,
): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= limits.maxStringLength;
  if (Array.isArray(value)) return isBoundedArray(value, containerDepth, budget, limits);
  if (isRecord(value)) return isBoundedObject(value, containerDepth, budget, limits);
  return false;
}

function isBoundedArray(
  value: readonly unknown[],
  depth: number,
  budget: MetadataBudget,
  limits: HostContextLimits,
): boolean {
  if (depth > limits.maxMetadataDepth || !reserveEntries(value.length, budget, limits)) {
    return false;
  }
  return value.every((entry) => isBoundedValue(entry, depth + 1, budget, limits));
}

function isBoundedObject(
  value: Readonly<Record<string, unknown>>,
  depth: number,
  budget: MetadataBudget,
  limits: HostContextLimits,
): boolean {
  if (depth > limits.maxMetadataDepth) return false;
  const entries = Object.entries(value);
  if (!reserveEntries(entries.length, budget, limits)) return false;
  return entries.every(
    ([key, entry]) =>
      key.length <= limits.maxStringLength && isBoundedValue(entry, depth + 1, budget, limits),
  );
}

function reserveEntries(count: number, budget: MetadataBudget, limits: HostContextLimits): boolean {
  budget.entries += count;
  return budget.entries <= limits.maxMetadataEntries;
}

function serializedByteLength(value: HostContext): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
