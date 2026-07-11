import { CLIENT_TOOL_CATALOG_LIMITS } from "./client-tool-catalog.js";
import {
  BOOLEAN_KEYWORDS,
  COUNT_KEYWORDS,
  DRAFT_07_SCHEMA_KEYWORDS,
  FINITE_NUMBER_KEYWORDS,
  JSON_SCHEMA_TYPES,
  SCHEMA_ARRAY_KEYWORDS,
  SCHEMA_MAP_KEYWORDS,
  SINGLE_SCHEMA_KEYWORDS,
  STRING_KEYWORDS,
} from "./client-tool-schema/keywords.js";
const LOCAL_JSON_POINTER = /^#(?:\/(?:[^~/]|~[01])*)*$/u;
const SAFE_PATTERN =
  /^\^(?:(?:[A-Za-z0-9 _:/.-]|\[[A-Za-z0-9 _:/.-]+\])(?:\{\d{1,3}(?:,\d{1,3})?\})?)+\$$/u;
const MAX_SCHEMA_COLLECTION_ENTRIES = 64;
const MAX_SCHEMA_PROPERTY_NAME_LENGTH = 128;
const MAX_SCHEMA_STRING_LENGTH = 1_024;
const MAX_SCHEMA_COUNT = 1_000_000;
const MAX_SAFE_PATTERN_LENGTH = 256;

type SchemaBudget = { nodes: number };

/**
 * Admit a bounded, explicitly validated draft-07 subset before Workflow's Ajv
 * reconstruction. This boundary rejects expensive or malformed schemas rather
 * than relying on durable execution to discover them.
 */
export function isSupportedClientToolSchema(
  schema: Readonly<Record<string, unknown>>,
): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(schema);
  } catch {
    return false;
  }
  if (
    new TextEncoder().encode(serialized).byteLength >
    CLIENT_TOOL_CATALOG_LIMITS.MAX_SCHEMA_BYTES
  ) {
    return false;
  }
  return isSupportedSchemaNode(schema, 1, { nodes: 0 });
}

function isSupportedSchemaNode(
  value: unknown,
  depth: number,
  budget: SchemaBudget,
): boolean {
  budget.nodes += 1;
  if (budget.nodes > CLIENT_TOOL_CATALOG_LIMITS.MAX_SCHEMA_NODES) return false;
  if (depth > CLIENT_TOOL_CATALOG_LIMITS.MAX_SCHEMA_DEPTH) return false;
  if (typeof value === "boolean") return true;
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([keyword, entry]) =>
    isSupportedKeywordEntry(keyword, entry, depth, budget),
  );
}

function isSupportedKeywordEntry(
  keyword: string,
  entry: unknown,
  depth: number,
  budget: SchemaBudget,
): boolean {
  if (!DRAFT_07_SCHEMA_KEYWORDS.has(keyword)) return false;
  if (SCHEMA_MAP_KEYWORDS.has(keyword)) {
    return isSupportedSchemaMap(keyword, entry, depth, budget);
  }
  if (SCHEMA_ARRAY_KEYWORDS.has(keyword)) {
    return isSupportedSchemaArray(entry, depth, budget);
  }
  if (keyword === "items" && Array.isArray(entry)) {
    return isSupportedSchemaArray(entry, depth, budget);
  }
  if (keyword === "items" || SINGLE_SCHEMA_KEYWORDS.has(keyword)) {
    return isSupportedSchemaNode(entry, depth + 1, budget);
  }
  return isValidAtomicKeyword(keyword, entry);
}

function isSupportedSchemaMap(
  keyword: string,
  entry: unknown,
  depth: number,
  budget: SchemaBudget,
): boolean {
  if (!isRecord(entry)) return false;
  const entries = Object.entries(entry);
  if (entries.length > MAX_SCHEMA_COLLECTION_ENTRIES) return false;
  return entries.every(([name, value]) => {
    if (name.length === 0 || name.length > MAX_SCHEMA_PROPERTY_NAME_LENGTH)
      return false;
    if (keyword === "patternProperties" && !isSafePattern(name)) return false;
    if (keyword !== "dependencies" || !Array.isArray(value)) {
      return isSupportedSchemaNode(value, depth + 1, budget);
    }
    return isUniqueStringList(value, MAX_SCHEMA_PROPERTY_NAME_LENGTH);
  });
}

function isSupportedSchemaArray(
  value: unknown,
  depth: number,
  budget: SchemaBudget,
): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_SCHEMA_COLLECTION_ENTRIES &&
    value.every((schema) => isSupportedSchemaNode(schema, depth + 1, budget))
  );
}

function isValidAtomicKeyword(keyword: string, value: unknown): boolean {
  if (STRING_KEYWORDS.has(keyword)) {
    return (
      typeof value === "string" && value.length <= MAX_SCHEMA_STRING_LENGTH
    );
  }
  if (BOOLEAN_KEYWORDS.has(keyword)) return typeof value === "boolean";
  if (FINITE_NUMBER_KEYWORDS.has(keyword)) {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (COUNT_KEYWORDS.has(keyword)) return isValidSchemaCount(value);
  if (keyword === "examples") {
    return (
      Array.isArray(value) && value.length <= MAX_SCHEMA_COLLECTION_ENTRIES
    );
  }
  if (keyword === "multipleOf") {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }
  return isValidSpecialKeyword(keyword, value);
}

function isValidSpecialKeyword(keyword: string, value: unknown): boolean {
  switch (keyword) {
    case "$ref":
      return isLocalReference(value);
    case "type":
      return isValidSchemaType(value);
    case "enum":
      return isUniqueJsonArray(value);
    case "required":
      return isUniqueStringList(value, MAX_SCHEMA_PROPERTY_NAME_LENGTH);
    case "pattern":
      return typeof value === "string" && isSafePattern(value);
    default:
      return keyword === "default" || keyword === "const";
  }
}

function isLocalReference(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length <= MAX_SCHEMA_STRING_LENGTH &&
    LOCAL_JSON_POINTER.test(value)
  );
}

function isValidSchemaType(value: unknown): boolean {
  if (typeof value === "string") return JSON_SCHEMA_TYPES.has(value);
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= JSON_SCHEMA_TYPES.size &&
    value.every(
      (type) => typeof type === "string" && JSON_SCHEMA_TYPES.has(type),
    ) &&
    new Set(value).size === value.length
  );
}

function isUniqueJsonArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_SCHEMA_COLLECTION_ENTRIES &&
    new Set(value.map((entry) => JSON.stringify(entry))).size === value.length
  );
}

function isUniqueStringList(value: unknown, maximumLength: number): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_SCHEMA_COLLECTION_ENTRIES &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.length > 0 &&
        entry.length <= maximumLength,
    ) &&
    new Set(value).size === value.length
  );
}

function isValidSchemaCount(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_SCHEMA_COUNT
  );
}

function isSafePattern(value: string): boolean {
  if (value.length > MAX_SAFE_PATTERN_LENGTH || !SAFE_PATTERN.test(value))
    return false;
  for (const match of value.matchAll(/\{(\d+)(?:,(\d+))?\}/gu)) {
    const minimum = Number(match[1]);
    const maximum = Number(match[2] ?? match[1]);
    if (minimum > maximum || maximum > 256) return false;
  }
  try {
    new RegExp(value, "u");
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
