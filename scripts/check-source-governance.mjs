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
import ts from "typescript";

const root = resolveRoot();
const errors = [];
const COPIED_SHARED_AI_PREFIX = "packages/side-chat-widget/src/shared/ai/";
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
const sourceLineBudgetExceptions = new Map([
  ["packages/db/src/drizzle/schema.ts", 308],
  // Pure persistence type-contract catalog (command shapes + repository
  // interfaces). It is declaration-only with no branching logic, so it is kept
  // as one cohesive contract rather than split across the schema-contract dir's
  // file budget.
  ["packages/db/src/schema-contract/repositories.ts", 444],
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
    validateSourceLineBudget(file, source);
    validateTypeSafetyEscapes(file, source);
    if (/class\s+ToolLoopAgent\b/.test(source)) {
      errors.push(`${file}: local ToolLoopAgent class shadows AI SDK export`);
    }
  }
}

function validateTypeSafetyEscapes(file, source) {
  if (!/\.tsx?$/u.test(file)) return;

  validateTypeScriptSuppressions(file, source);

  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  visit(sourceFile);

  function visit(node) {
    if (ts.isAsExpression(node) && node.type.getText(sourceFile) !== "const") {
      reportAssertion(node, `type assertion "as ${node.type.getText(sourceFile)}"`);
    } else if (ts.isTypeAssertionExpression(node)) {
      reportAssertion(node, `angle-bracket type assertion "<${node.type.getText(sourceFile)}>"`);
    } else if (ts.isNonNullExpression(node)) {
      reportAssertion(node, 'non-null assertion "!"');
    } else if (node.exclamationToken !== undefined) {
      reportAssertion(node, 'definite-assignment assertion "!"');
    } else if (
      node.kind === ts.SyntaxKind.AnyKeyword &&
      !ts.isAsExpression(node.parent) &&
      !ts.isTypeAssertionExpression(node.parent)
    ) {
      reportAssertion(node, 'explicit "any" type');
    }

    ts.forEachChild(node, visit);
  }

  function reportAssertion(node, assertion) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    errors.push(
      `${file}:${line}: TypeScript escape hatch is forbidden: ${assertion}.\n` +
        "  Type-safety fix: keep uncertain values as unknown, narrow them with a type guard or parser, and prove indexed values before use. `as const` and `satisfies` remain allowed.",
    );
  }
}

function validateTypeScriptSuppressions(file, source) {
  const directivePattern = /^\s*(?:\/\/|\/\*)\s*@ts-(ignore|nocheck|expect-error)\b(.*)$/u;

  for (const [index, line] of source.split("\n").entries()) {
    const match = directivePattern.exec(line);
    if (!match) continue;

    const directive = match[1];
    if (directive === "ignore" || directive === "nocheck") {
      errors.push(`${file}:${index + 1}: TypeScript suppression "@ts-${directive}" is forbidden.`);
      continue;
    }

    const reason = match[2]?.replace(/\*\/$/u, "").trim();
    if (!isTestLikeSourceFile(file)) {
      errors.push(`${file}:${index + 1}: "@ts-expect-error" is allowed only in test files.`);
    } else if (!reason) {
      errors.push(`${file}:${index + 1}: "@ts-expect-error" requires a reason.`);
    }
  }
}

function validateSourceLineBudget(file, source) {
  const lineCount = source.split("\n").length;
  const productionSource = isGovernedProductionSource(file);
  const exceptionLimit = sourceLineBudgetExceptions.get(file);
  const testSource = isTestLikeSourceFile(file);

  if (
    productionSource &&
    !testSource &&
    !isCopiedSharedAiPrimitive(file) &&
    lineCount > (exceptionLimit ?? 300)
  ) {
    errors.push(
      `${file}: production source file has ${lineCount} lines (max ${exceptionLimit ?? 300})`,
    );
  }
  if (productionSource && testSource && lineCount > 450) {
    errors.push(`${file}: test source file exceeds 450-line budget`);
  }
}

function isGovernedProductionSource(file) {
  return file.includes("/src/");
}

function isTestLikeSourceFile(file) {
  return /\.(?:test|spec)\.(?:ts|tsx)$/u.test(file) || file.includes(".test-support.");
}

function isCopiedSharedAiPrimitive(file) {
  return file.startsWith(COPIED_SHARED_AI_PREFIX);
}
