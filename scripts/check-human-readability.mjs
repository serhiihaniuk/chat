import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { failIfErrors, listFiles, listSourceFiles, resolveRoot } from "./lib/governance.mjs";
import ts from "typescript";

const root = resolveRoot();
const errors = [];
const warnings = [];

const TEMPORARY_PLAN_PREFIX = "side-chat-readability-to-9-orchestrator-plan/";
const MAX_DOC_PARAGRAPH_CHARACTERS = 620;
const MAX_DOC_PARAGRAPH_WORDS = 105;
// This is intentionally a compound threshold. A long declaration catalog is
// not automatically hard to read, and a small helper module does not need an
// essay. The gate targets large orchestration/component files with many moving
// parts, where a maintainer otherwise has no local map.
const HIGH_LOAD_MIN_LINES = 400;
const HIGH_LOAD_MIN_FUNCTIONS = 12;

// The 300/450 source line budget is owned solely by check-source-governance.mjs;
// this file owns documentation density and the readability heuristics below.

const requiredReadableDocs = lines(`
docs/README.md
docs/domain/vocabulary.md
docs/architecture/system-map.md
docs/architecture/assistant-turn.md
docs/architecture/extension-seams.md
docs/architecture/package-boundaries.md
docs/architecture/runtime-and-protocol-events.md
docs/architecture/widget-and-host-integration.md
docs/product/requirements.md
docs/operations/verification.md
packages/side-chat-widget/src/shared/ai/README.md
`);

const staleTruthDocs = lines(`
docs/CONTEXT.md
docs/architecture/production-system-design.md
docs/architecture/implementation-plan.md
docs/architecture/overview.md
docs/ops/side-chat-production-runbook.md
.agents/handoff/ai-harness-orchestrator.md
`);

validateRequiredDocs();
validateStaleTruthDocs();
validateMarkdownDocs();
validateSourceReadability();
validateQualitySkill();

printWarnings();
failIfErrors(errors);

function lines(value) {
  return value.trim().split("\n");
}

function validateRequiredDocs() {
  for (const file of requiredReadableDocs) {
    if (existsSync(join(root, file))) continue;

    errors.push(
      `${file}: required readability documentation is missing.\n` +
        "  Readable fix: create the canonical doc or quarantine README so agents have one source of truth.",
    );
  }
}

function validateStaleTruthDocs() {
  for (const file of staleTruthDocs) {
    if (!existsSync(join(root, file))) continue;

    errors.push(
      `${file}: obsolete target/current/planning doc remains as durable truth.\n` +
        "  Readable fix: move current content into docs/domain, docs/product, or docs/architecture and delete the stale source.",
    );
  }
}

function validateMarkdownDocs() {
  for (const file of listMarkdownFiles()) {
    const source = readFileSync(join(root, file), "utf8");
    validateDocContract(file, source);
    validateDocParagraphs(file, source);
    validateReadmeVocabularyOwnership(file, source);
    validateFakeProductionLanguage(file, source);
  }
}

function listMarkdownFiles() {
  return listFiles(root, (file) => {
    if (!file.endsWith(".md")) return false;
    if (isIgnoredPath(file)) return false;
    return isDurableDocPath(file);
  });
}

function isDurableDocPath(file) {
  return (
    file === "README.md" ||
    file === "AGENTS.md" ||
    file.startsWith("docs/") ||
    file.endsWith("/README.md")
  );
}

function validateDocContract(file, source) {
  if (file === "AGENTS.md") return;
  if (file.startsWith("docs/adr/")) return;

  const required = ["Read this when:", "Source of truth for:", "Not source of truth for:"];
  for (const phrase of required) {
    if (source.includes(phrase)) continue;

    errors.push(
      `${file}: durable doc is missing "${phrase}".\n` +
        "  Readable fix: start the file with the standard reader/source/non-source contract.",
    );
  }
}

function validateDocParagraphs(file, source) {
  for (const paragraph of proseParagraphs(source)) {
    const normalized = paragraph.replace(/\s+/gu, " ").trim();
    const wordCount = normalized.split(/\s+/u).filter(Boolean).length;
    if (normalized.length <= MAX_DOC_PARAGRAPH_CHARACTERS && wordCount <= MAX_DOC_PARAGRAPH_WORDS) {
      continue;
    }

    errors.push(
      `${file}: paragraph is too dense (${wordCount} words, ${normalized.length} characters).\n` +
        "  Readable fix: split it into a table, list, short flow, or smaller reference paragraphs.",
    );
  }
}

function proseParagraphs(source) {
  const paragraphs = [];
  let insideFence = false;
  let current = [];

  for (const line of source.split("\n")) {
    if (line.trim().startsWith("```")) {
      insideFence = !insideFence;
      flush();
      continue;
    }
    if (insideFence || isNonProseLine(line)) {
      flush();
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    current.push(line.trim());
  }

  flush();
  return paragraphs;

  function flush() {
    if (current.length > 0) paragraphs.push(current.join(" "));
    current = [];
  }
}

function isNonProseLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("|") ||
    trimmed.startsWith("- ") ||
    trimmed.startsWith("* ") ||
    /^\d+\.\s/u.test(trimmed) ||
    trimmed.startsWith(">") ||
    trimmed.startsWith("<!--")
  );
}

function validateReadmeVocabularyOwnership(file, source) {
  if (!file.endsWith("README.md")) return;
  if (file === "docs/README.md") return;
  if (!/\|\s*Term\s*\|\s*Meaning\s*\|/iu.test(source)) return;

  errors.push(
    `${file}: README defines vocabulary terms that belong in docs/domain/vocabulary.md.\n` +
      "  Readable fix: move the term table to the vocabulary doc and link to it from this local package card.",
  );
}

function validateFakeProductionLanguage(file, source) {
  if (!/production runbook|rollout|rollback/iu.test(source)) return;
  if (file.includes("product/requirements.md")) return;

  warnings.push(
    `${file}: production-operation wording found. Confirm this is real operation guidance, not fake current truth.`,
  );
}

function validateSourceReadability() {
  for (const file of listSourceFiles(root)) {
    if (isIgnoredPath(file) || !isProjectSourceFile(file)) continue;

    const source = readFileSync(join(root, file), "utf8");
    warnInsideOutEffectOrStream(file, source);
    warnDenseConditionalSpreads(file, source);
    warnDenseArchitectureComments(file, source);
    validateHighLoadOrientationComment(file, source);
  }
}

function validateHighLoadOrientationComment(file, source) {
  if (isTestLikeSource(file)) return;

  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineCount = source.split("\n").length;
  const functionCount = countFunctionLikeNodes(sourceFile);
  if (lineCount < HIGH_LOAD_MIN_LINES || functionCount < HIGH_LOAD_MIN_FUNCTIONS) return;

  const orientationPrefix = source.slice(0, firstImplementationStart(sourceFile));
  if (hasMentalModelComment(orientationPrefix)) return;

  errors.push(
    `${file}: high-load source (${lineCount} lines, ${functionCount} functions) needs a file-level mental-model comment.\n` +
      "  Readable fix: before the first implementation declaration, explain what this file owns, the top-down flow or boundary invariant, and what deliberately stays elsewhere. Do not add a caption that only repeats the filename.",
  );
}

function countFunctionLikeNodes(sourceFile) {
  let count = 0;
  visit(sourceFile);
  return count;

  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node)
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  }
}

function firstImplementationStart(sourceFile) {
  const statement = sourceFile.statements.find(
    (candidate) =>
      !ts.isImportDeclaration(candidate) &&
      !ts.isImportEqualsDeclaration(candidate) &&
      !ts.isExportDeclaration(candidate),
  );
  return statement?.getStart(sourceFile) ?? sourceFile.getEnd();
}

function hasMentalModelComment(prefix) {
  const comments = prefix.match(/\/\*\*[\s\S]*?\*\//gu) ?? [];
  return comments.some((comment) => {
    const words = comment
      .replace(/\/\*\*|\*\//gu, " ")
      .replace(/^\s*\*/gmu, " ")
      .trim()
      .split(/\s+/u)
      .filter(Boolean);
    const ownsRole =
      /\b(owns|coordinates|orchestrates|adapts|maps|renders|workflow|lifecycle|boundary)\b/iu.test(
        comment,
      );
    const explainsFlowOrInvariant =
      /\b(from|into|before|after|when|while|must|never|only|elsewhere|invariant|failure|terminal)\b/iu.test(
        comment,
      );
    return words.length >= 24 && ownsRole && explainsFlowOrInvariant;
  });
}

function warnInsideOutEffectOrStream(file, source) {
  const patterns = [
    /Stream\.unwrap\s*\(\s*Effect\.(?:map|flatMap|gen)\s*\(/u,
    /Effect\.(?:map|flatMap)\s*\([^)]*Stream\.unwrap/u,
  ];
  if (!patterns.some((pattern) => pattern.test(source))) return;

  warnings.push(
    `${file}: possible inside-out Effect/Stream expression. Readable fix: split prepare -> open -> map -> finalize stages.`,
  );
}

function warnDenseConditionalSpreads(file, source) {
  const conditionalSpreads = source.match(/\.\.\.\s*\([^)]*(?:&&|\?)\s*/gu) ?? [];
  if (conditionalSpreads.length < 4) return;

  warnings.push(
    `${file}: conditional object spread chain has ${conditionalSpreads.length} branches. Readable fix: name the boundary DTO builder steps.`,
  );
}

function warnDenseArchitectureComments(file, source) {
  for (const comment of commentsIn(source)) {
    const termCount = architectureTermCount(comment);
    if (termCount < 4 || hasSourceTargetGrounding(comment)) continue;

    warnings.push(
      `${file}: dense architecture comment names ${termCount} hard terms without source/target/invariant grounding.`,
    );
  }
}

function commentsIn(source) {
  const comments = [];
  const pattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu;
  for (const match of source.matchAll(pattern)) {
    comments.push(match[0]);
  }
  return comments;
}

function architectureTermCount(comment) {
  const matches = comment.match(
    /\b(runtime|provider|adapter|protocol|activity|context|manifest|tool|turn|stream|Effect|Stream|typed|boundary|policy|profile|workflow|terminal)\b/gu,
  );
  return matches?.length ?? 0;
}

function hasSourceTargetGrounding(comment) {
  return /\b(source|target|receives|emits|returns|becomes|preserve|invariant|hidden|hides|normalizes|from|to)\b/iu.test(
    comment,
  );
}

function validateQualitySkill() {
  const skill = ".agents/skills/side-chat-code-quality-gate/SKILL.md";
  if (!existsSync(join(root, skill))) {
    errors.push(`${skill}: canonical code-quality skill is missing.`);
    return;
  }

  const source = readFileSync(join(root, skill), "utf8");
  for (const phrase of ["docs quality", "Documentation quality gate", "final-state rewrite"]) {
    if (source.includes(phrase)) continue;
    errors.push(`${skill}: missing readability instruction phrase "${phrase}".`);
  }
}

function isIgnoredPath(file) {
  return (
    file.startsWith(TEMPORARY_PLAN_PREFIX) ||
    file.includes("/dist/") ||
    file.includes("/build/") ||
    file.includes("/coverage/") ||
    file.startsWith(".omx/") ||
    file.startsWith(".git/")
  );
}

function isProjectSourceFile(file) {
  return (
    /^(?:apps|packages|test-harness)\/.+\/src\//u.test(file) &&
    /\.(?:ts|tsx|js|jsx|mjs)$/u.test(file) &&
    !file.endsWith(".d.ts")
  );
}

function isTestLikeSource(file) {
  return /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/u.test(file) || file.includes(".test-support.");
}

function printWarnings() {
  for (const warning of warnings) {
    console.warn(`[readability warning] ${warning}`);
  }
}
