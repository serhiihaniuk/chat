import { z } from "zod";

import type { HostContext, HostContextMetadata, HostContextPolicy } from "#domain/host-context";

type MetadataBudget = { entries: number };

/** Validate untrusted host page data without logging or retaining the rejected value. */
export function parseHostContext(
  candidate: unknown,
  policy: HostContextPolicy,
): HostContext | undefined {
  if (!policy.enabled) return undefined;
  const parsed = hostContextSchema(policy).safeParse(candidate);
  if (!parsed.success) return undefined;

  const metadata = parsed.data.metadata;
  if (metadata !== undefined && !isBoundedMetadata(metadata, policy)) return undefined;

  const hostContext: HostContext = {
    schemaVersion: parsed.data.schemaVersion,
    origin: parsed.data.origin,
    url: parsed.data.url,
    title: parsed.data.title,
    metadata,
  };
  return serializedByteLength(hostContext) <= policy.maxSerializedBytes ? hostContext : undefined;
}

function hostContextSchema(policy: HostContextPolicy) {
  const boundedString = z.string().max(policy.maxStringLength);
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
  policy: HostContextPolicy,
): value is HostContextMetadata {
  if (!isRecord(value)) return false;
  return isBoundedObject(value, 1, { entries: 0 }, policy);
}

function isBoundedValue(
  value: unknown,
  containerDepth: number,
  budget: MetadataBudget,
  policy: HostContextPolicy,
): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= policy.maxStringLength;
  if (Array.isArray(value)) return isBoundedArray(value, containerDepth, budget, policy);
  if (isRecord(value)) return isBoundedObject(value, containerDepth, budget, policy);
  return false;
}

function isBoundedArray(
  value: readonly unknown[],
  depth: number,
  budget: MetadataBudget,
  policy: HostContextPolicy,
): boolean {
  if (depth > policy.maxMetadataDepth || !reserveEntries(value.length, budget, policy)) {
    return false;
  }
  return value.every((entry) => isBoundedValue(entry, depth + 1, budget, policy));
}

function isBoundedObject(
  value: Readonly<Record<string, unknown>>,
  depth: number,
  budget: MetadataBudget,
  policy: HostContextPolicy,
): boolean {
  if (depth > policy.maxMetadataDepth) return false;
  const entries = Object.entries(value);
  if (!reserveEntries(entries.length, budget, policy)) return false;
  return entries.every(
    ([key, entry]) =>
      key.length <= policy.maxStringLength && isBoundedValue(entry, depth + 1, budget, policy),
  );
}

function reserveEntries(count: number, budget: MetadataBudget, policy: HostContextPolicy): boolean {
  budget.entries += count;
  return budget.entries <= policy.maxMetadataEntries;
}

function serializedByteLength(value: HostContext): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
