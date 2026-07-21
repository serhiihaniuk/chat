import { readFileSync } from "node:fs";
import { join } from "node:path";
import { failIfErrors, listSourceFiles, resolveRoot } from "./lib/governance.mjs";

const root = resolveRoot();
const errors = [];

for (const file of listSourceFiles(root)) {
  if (!isWorkspaceSource(file) || !isTypeScriptSource(file)) continue;

  const source = readFileSync(join(root, file), "utf8");
  validateOldOptionalHelper(file, source);
  validateTruthyUndefined(file, source);
  validateConditionalEmptyObject(file, source);
}

failIfErrors(errors);

function isWorkspaceSource(file) {
  return /^(?:apps|packages|test-harness)\//u.test(file) && file.includes("/src/");
}

function isTypeScriptSource(file) {
  return /\.(?:ts|tsx)$/u.test(file) && !file.endsWith(".d.ts");
}

function isProductionSource(file) {
  return (
    !file.startsWith("test-harness/") &&
    !/\.(?:test|spec)\.(?:ts|tsx)$/u.test(file) &&
    !file.includes(".test-support.")
  );
}

function validateOldOptionalHelper(file, source) {
  for (const line of matchingLines(source, /\boptionalField\s*\(/u)) {
    errors.push(
      `${file}:${line.number}: optionalField is removed; choose omitUndefinedField, omitNullishField, compactJsonObject, or direct properties by contract.`,
    );
  }
}

function validateTruthyUndefined(file, source) {
  if (!isProductionSource(file)) return;

  for (const line of matchingLines(source, /\|\|\s*undefined\b/u)) {
    errors.push(
      `${file}:${line.number}: avoid truthy-to-undefined coercion; pass the value directly, use ?? for nullish normalization, or compare the invalid empty value explicitly.`,
    );
  }
}

function validateConditionalEmptyObject(file, source) {
  for (const line of matchingLines(source, /\?\s*\{[^{}\n]*\}\s*:\s*\{\}/u)) {
    errors.push(
      `${file}:${line.number}: conditional empty-object optional shape hides the contract; prefer explicit undefined-capable fields or a named boundary compaction helper.`,
    );
  }
}

function matchingLines(source, pattern) {
  return source
    .split("\n")
    .map((text, index) => ({ number: index + 1, text }))
    .filter((line) => pattern.test(line.text));
}
