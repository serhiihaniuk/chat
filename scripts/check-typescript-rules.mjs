import {
  failIfErrors,
  listFiles,
  listSourceFiles,
  readJson,
  resolveRoot,
} from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = resolveRoot();
const errors = [];
const requiredStrictOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  noImplicitOverride: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  noPropertyAccessFromIndexSignature: true,
  useUnknownInCatchVariables: true,
  isolatedModules: true,
  verbatimModuleSyntax: true,
};

const base = readJson(root, "tsconfig.base.json");
for (const [option, value] of Object.entries(requiredStrictOptions)) {
  if (base.compilerOptions?.[option] !== value)
    errors.push(
      `tsconfig.base.json: compilerOptions.${option} must be ${String(value)}`,
    );
}

for (const file of listFiles(root, (path) => path.endsWith("tsconfig.json"))) {
  const tsconfig = readJson(root, file);
  if (
    file !== "tsconfig.json" &&
    tsconfig.compilerOptions?.composite !== true
  ) {
    errors.push(
      `${file}: workspace tsconfig must enable composite project references`,
    );
  }
}

for (const file of listSourceFiles(root)) {
  if (!/\.(?:ts|tsx)$/.test(file)) continue;

  const source = readFileSync(join(root, file), "utf8");
  if (/\bany\b/.test(source)) errors.push(`${file}: any is forbidden`);
  if (/@ts-ignore/.test(source))
    errors.push(`${file}: @ts-ignore is forbidden`);
  if (/as\s+unknown\s+as/.test(source))
    errors.push(`${file}: unsafe double assertion is forbidden`);
}

failIfErrors(errors);
