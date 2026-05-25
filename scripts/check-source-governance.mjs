import {
  failIfErrors,
  listFiles,
  listSourceFiles,
  readJson,
  resolveRoot,
} from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

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
  skipLibCheck: true,
};
const sourceLineBudgetExceptions = new Set([
  "packages/db/src/drizzle/schema.ts",
  "packages/side-chat-widget/src/shared/ai/code-block.tsx",
  "packages/side-chat-widget/src/shared/ai/message.tsx",
  "packages/side-chat-widget/src/shared/ai/prompt-input.tsx",
]);

validateTsconfigPolicy();
validateTestPlacement();
validateTrackedArtifacts();
validateSourceFiles();

failIfErrors(errors);

function validateTsconfigPolicy() {
  const base = readJson(root, "tsconfig.base.json");
  for (const [option, value] of Object.entries(requiredStrictOptions)) {
    if (base.compilerOptions?.[option] !== value) {
      errors.push(`tsconfig.base.json: compilerOptions.${option} must be ${String(value)}`);
    }
  }

  for (const file of listFiles(root, (path) => path.endsWith("tsconfig.json"))) {
    const tsconfig = readJson(root, file);
    if (file !== "tsconfig.json" && tsconfig.compilerOptions?.composite !== true) {
      errors.push(`${file}: workspace tsconfig must enable composite project references`);
    }
  }
}

function validateTestPlacement() {
  for (const file of listFiles(root, (path) => /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(path))) {
    const parts = file.split("/");
    if (parts.includes("dist") || parts.includes("build")) continue;

    if (parts.includes("test") || parts.includes("tests")) {
      errors.push(
        `${file}: ordinary tests must be colocated beside source, not in test/tests folders`,
      );
    }

    const isHarness = file.startsWith("test-harness/");
    const isColocatedSourceTest = file.includes("/src/");
    if (!isHarness && !isColocatedSourceTest && !file.startsWith("scripts/")) {
      errors.push(`${file}: tests must be colocated under src or live in test-harness`);
    }
  }
}

function validateTrackedArtifacts() {
  const gitLsFiles = spawnSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  });
  const trackedFiles =
    gitLsFiles.status === 0 ? new Set(gitLsFiles.stdout.split("\n").filter(Boolean)) : undefined;
  if (trackedFiles === undefined) return;

  for (const file of listFiles(root)) {
    if (
      /^(?:apps|packages|test-harness)\/[^/]+\/(?:dist|build|coverage)\//.test(file) &&
      trackedFiles.has(file)
    ) {
      errors.push(`${file}: generated build/test artifact must not be tracked`);
    }
  }
}

function validateSourceFiles() {
  for (const file of listSourceFiles(root)) {
    if (/(?:^|\/)(?:dist|build|coverage)\//.test(file)) continue;

    const source = readFileSync(join(root, file), "utf8");
    const productionSource = file.includes("/src/");
    validateSourceLineBudget(file, source);
    if (productionSource && /as\s+unknown\s+as/.test(source)) {
      errors.push(`${file}: unsafe double assertion is forbidden`);
    }
    if (/class\s+ToolLoopAgent\b/.test(source)) {
      errors.push(`${file}: local ToolLoopAgent class shadows AI SDK export`);
    }
  }
}

function validateSourceLineBudget(file, source) {
  const lineCount = source.split("\n").length;
  const productionSource = file.includes("/src/");

  if (
    productionSource &&
    !file.endsWith(".test.ts") &&
    !sourceLineBudgetExceptions.has(file) &&
    lineCount > 300
  ) {
    errors.push(`${file}: production source file exceeds 300-line budget`);
  }
  if (productionSource && file.endsWith(".test.ts") && lineCount > 450) {
    errors.push(`${file}: test source file exceeds 450-line budget`);
  }
}
