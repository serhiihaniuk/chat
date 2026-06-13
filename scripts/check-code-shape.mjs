import ts from "typescript";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { failIfErrors, listSourceFiles, resolveRoot } from "./lib/governance.mjs";

const root = resolveRoot();
const errors = [];
const MAX_COGNITIVE_COMPLEXITY = 12;
const MAX_PRODUCTION_FUNCTIONS_PER_FILE = 28;
const MAX_PRODUCTION_FILES_PER_DIRECTORY = 12;
const MAX_NESTED_FUNCTIONS = 8;
const shapeBudgetExceptions = new Set([
  "packages/side-chat-widget/src/shared/ai/code-block.tsx",
  "packages/side-chat-widget/src/shared/ai/message.tsx",
  "packages/side-chat-widget/src/shared/ai/prompt-input.tsx",
]);
const directoryBudgetExceptions = new Map([
  [
    "packages/side-chat-widget/src/shared/ui",
    {
      maxFiles: 20,
      reason: "shared UI primitive catalog keeps direct #shared/ui/<component> imports stable",
    },
  ],
]);

const sourceFiles = listSourceFiles(root);

for (const file of sourceFiles) {
  if (!isWorkspaceSourceFile(file)) continue;

  validateTestSupportPlacement(file);
  if (!isAnalyzableSourceFile(file) || shapeBudgetExceptions.has(file)) continue;

  const source = readFileSync(join(root, file), "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  validateFunctionShape(file, sourceFile);
  validateFileResponsibilityBudget(file, sourceFile);
}

validateDirectoryFileBudgets(sourceFiles);
failIfErrors(errors);

function isWorkspaceSourceFile(file) {
  return /^(?:apps|packages|test-harness)\//u.test(file) && file.includes("/src/");
}

function isAnalyzableSourceFile(file) {
  return /\.(?:ts|tsx|js|jsx)$/u.test(file) && !file.endsWith(".d.ts");
}

function isTestLikeFile(file) {
  return /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/u.test(file) || file.includes(".test-support.");
}

function validateTestSupportPlacement(file) {
  if (!file.includes(".test-support.")) return;
  if (file.includes("/src/testing/")) return;

  errors.push(
    `${file}: test support must live under src/testing/** instead of a product workflow folder.\n` +
      "  Refactor prompt: move fixtures, builders, and fakes to src/testing/<feature>/...test-support.ts, update colocated tests to import from there, and keep production folders readable without test-only files mixed into the workflow.",
  );
}

function validateFunctionShape(file, sourceFile) {
  for (const node of functionLikeNodes(sourceFile)) {
    const score = cognitiveComplexity(node);
    if (score > MAX_COGNITIVE_COMPLEXITY) {
      errors.push(
        `${file}:${lineOf(sourceFile, node)}: ${functionName(node)} has cognitive complexity ${score} (max ${MAX_COGNITIVE_COMPLEXITY}).\n` +
          "  Refactor prompt: split independent decisions into named helpers or a table-driven dispatcher, keep one orchestration responsibility per function, and lock observable behavior with targeted tests before editing.",
      );
    }

    const nestedFunctions = nestedFunctionCount(node);
    if (!isTestLikeFile(file) && nestedFunctions > MAX_NESTED_FUNCTIONS) {
      errors.push(
        `${file}:${lineOf(sourceFile, node)}: ${functionName(node)} contains ${nestedFunctions} nested functions (max ${MAX_NESTED_FUNCTIONS}).\n` +
          "  Refactor prompt: move nested closures into module-level helpers or smaller factory modules so collaborators can scan responsibilities top-down without opening one everything-bag function.",
      );
    }
  }
}

function validateFileResponsibilityBudget(file, sourceFile) {
  if (isTestLikeFile(file)) return;

  const count = functionLikeNodes(sourceFile).length;
  if (count <= MAX_PRODUCTION_FUNCTIONS_PER_FILE) return;

  errors.push(
    `${file}: production source file declares ${count} function-like blocks (max ${MAX_PRODUCTION_FUNCTIONS_PER_FILE}).\n` +
      "  Refactor prompt: split the file by domain responsibility, prefer deep modules with small public surfaces, and move test-only builders to src/testing/** instead of adding more helpers here.",
  );
}

function validateDirectoryFileBudgets(files) {
  const byDirectory = new Map();
  for (const file of files) {
    if (!isProductionSourceFile(file)) continue;
    const directory = file.slice(0, file.lastIndexOf("/"));
    byDirectory.set(directory, (byDirectory.get(directory) ?? 0) + 1);
  }

  for (const [directory, count] of byDirectory) {
    const exception = directoryBudgetExceptions.get(directory);
    const maxFiles = exception?.maxFiles ?? MAX_PRODUCTION_FILES_PER_DIRECTORY;
    if (count <= maxFiles) continue;

    errors.push(
      `${directory}: production source directory contains ${count} files (max ${maxFiles}).\n` +
        `  Refactor prompt: split this folder into responsibility-named child folders, leave only public barrels or primary entrypoints at this level, and update imports so the hierarchy explains the domain before someone opens files.${
          exception ? ` Existing exception reason: ${exception.reason}.` : ""
        }`,
    );
  }
}

function isProductionSourceFile(file) {
  return (
    isWorkspaceSourceFile(file) &&
    isAnalyzableSourceFile(file) &&
    !isTestLikeFile(file) &&
    !file.endsWith(".d.ts")
  );
}

function functionLikeNodes(sourceFile) {
  const nodes = [];
  visit(sourceFile);
  return nodes;

  function visit(node) {
    if (isFunctionLike(node) && !isTypeOnlySignature(node)) nodes.push(node);
    ts.forEachChild(node, visit);
  }
}

function cognitiveComplexity(functionNode) {
  let score = 0;
  visitFunctionBody(functionNode, 0);
  return score;

  function visitFunctionBody(node, nesting) {
    if (node !== functionNode && isFunctionLike(node)) return;

    if (isDecisionNode(node)) {
      score += 1 + nesting;
      visitDecisionChildren(node, nesting + 1);
      return;
    }

    if (isBooleanDecision(node)) score += 1;

    ts.forEachChild(node, (child) => visitFunctionBody(child, nesting));
  }

  function visitDecisionChildren(node, nesting) {
    ts.forEachChild(node, (child) => visitFunctionBody(child, nesting));
  }
}

function nestedFunctionCount(functionNode) {
  let count = 0;
  visit(functionNode);
  return count;

  function visit(node) {
    if (node !== functionNode && isFunctionLike(node) && !isTypeOnlySignature(node)) count += 1;
    ts.forEachChild(node, visit);
  }
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function isTypeOnlySignature(node) {
  return (
    ts.isCallSignatureDeclaration(node) ||
    ts.isConstructSignatureDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isFunctionTypeNode(node)
  );
}

function isDecisionNode(node) {
  return (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node) ||
    ts.isCaseClause(node)
  );
}

function isBooleanDecision(node) {
  return (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  );
}

function functionName(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent) && ts.isStringLiteral(parent.name)) return parent.name.text;
  return "anonymous function";
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}
