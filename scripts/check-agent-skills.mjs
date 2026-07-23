/**
 * Validates the repository-local quality skill as a distributable agent surface:
 * metadata schema, reachable references, required evaluation cases, and declared
 * verification/security guidance must move together.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { failIfErrors, resolveRoot } from "./lib/governance.mjs";

const root = resolveRoot();
const errors = [];
const qualitySkillDirectory = ".agents/skills/side-chat-code-quality-gate";
const skillPath = `${qualitySkillDirectory}/SKILL.md`;
const evalPath = `${qualitySkillDirectory}/references/eval-prompts.md`;
const agentMetadataPath = `${qualitySkillDirectory}/agents/openai.yaml`;
const requiredEvalCases = new Set([
  "boundary-leak",
  "native-stream",
  "over-refactor",
  "repository-audit",
  "security-review",
  "verification-reporting",
]);

validateQualitySkill();
failIfErrors(errors);

function validateQualitySkill() {
  const source = readRequiredFile(skillPath);
  if (source === null) return;

  validateFrontmatter(source);
  validateAgentMetadata();
  validateReferences(source);
  validateEvaluationCases();
}

function validateAgentMetadata() {
  const source = readRequiredFile(agentMetadataPath);
  if (source === null) return;

  validateNoLegacyAgentKeys(source);
  validateAgentInterface(source);
}

function validateNoLegacyAgentKeys(source) {
  for (const legacyKey of ["name", "triggers", "version"]) {
    if (new RegExp(`^${legacyKey}:`, "mu").test(source)) {
      errors.push(`${agentMetadataPath}: legacy top-level key ${legacyKey}.`);
    }
  }
}

function validateAgentInterface(source) {
  const displayName = /^  display_name: "([^"]+)"$/mu.exec(source)?.[1] ?? "";
  const shortDescription = /^  short_description: "([^"]+)"$/mu.exec(source)?.[1] ?? "";
  const defaultPrompt = /^  default_prompt: "([^"]+)"$/mu.exec(source)?.[1] ?? "";
  validateDisplayName(source, displayName);
  validateShortDescription(shortDescription);
  validateDefaultPrompt(defaultPrompt);
  validateInvocationPolicy(source);
}

function validateDisplayName(source, displayName) {
  if (!/^interface:\r?$/mu.test(source) || !displayName) {
    errors.push(`${agentMetadataPath}: interface.display_name is required.`);
  }
}

function validateShortDescription(shortDescription) {
  if (shortDescription.length < 25 || shortDescription.length > 64) {
    errors.push(`${agentMetadataPath}: short_description must contain 25 to 64 characters.`);
  }
}

function validateDefaultPrompt(defaultPrompt) {
  if (!defaultPrompt.includes("$side-chat-code-quality-gate")) {
    errors.push(`${agentMetadataPath}: default_prompt must name $side-chat-code-quality-gate.`);
  }
}

function validateInvocationPolicy(source) {
  if (
    !/^policy:\r?$/mu.test(source) ||
    !/^  allow_implicit_invocation: (?:true|false)\r?$/mu.test(source)
  ) {
    errors.push(`${agentMetadataPath}: policy.allow_implicit_invocation is required.`);
  }
}

function validateFrontmatter(source) {
  const values = parseFrontmatter(source);
  if (values === null) return;

  validateFrontmatterKeys(values);
  validateSkillName(values.get("name") ?? "");
  validateDescription(values.get("description") ?? "");
}

function parseFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(source);
  if (!match?.[1]) {
    errors.push(`${skillPath}: missing or malformed YAML frontmatter.`);
    return null;
  }

  const values = new Map();
  for (const line of match[1].split(/\r?\n/u)) {
    const entry = /^([a-z0-9-]+):\s*(.+)$/u.exec(line);
    if (!entry?.[1] || !entry[2]) {
      errors.push(`${skillPath}: frontmatter must contain flat non-empty key/value fields.`);
      continue;
    }
    if (values.has(entry[1])) errors.push(`${skillPath}: duplicate frontmatter key ${entry[1]}.`);
    values.set(entry[1], entry[2].trim());
  }
  return values;
}

function validateFrontmatterKeys(values) {
  const allowed = new Set(["description", "name"]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) errors.push(`${skillPath}: unsupported frontmatter key ${key}.`);
  }
  for (const key of allowed) {
    if (!values.has(key)) errors.push(`${skillPath}: missing frontmatter key ${key}.`);
  }
}

function validateSkillName(name) {
  if (name !== basename(qualitySkillDirectory)) {
    errors.push(`${skillPath}: name must match the skill directory.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name) || name.length > 64) {
    errors.push(`${skillPath}: name must be hyphen-case and at most 64 characters.`);
  }
}

function validateDescription(description) {
  if (description.length > 1024 || /[<>]/u.test(description)) {
    errors.push(
      `${skillPath}: description must be at most 1024 characters without angle brackets.`,
    );
  }
}

function validateReferences(skillSource) {
  const referenceDirectory = join(root, qualitySkillDirectory, "references");
  if (!existsSync(referenceDirectory)) {
    errors.push(`${qualitySkillDirectory}: references directory is missing.`);
    return;
  }

  const files = readdirSync(referenceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `references/${entry.name}`)
    .sort();
  const declared = new Set(
    [...skillSource.matchAll(/`(references\/[^`\r\n]+\.md)`/gu)].map((match) => match[1]),
  );

  for (const file of files) {
    if (!declared.has(file))
      errors.push(`${qualitySkillDirectory}/${file}: reference is unreachable.`);
  }
  for (const file of declared) {
    if (!existsSync(join(root, qualitySkillDirectory, file))) {
      errors.push(`${skillPath}: declared reference ${file} does not exist.`);
    }
  }
}

function validateEvaluationCases() {
  const source = readRequiredFile(evalPath);
  if (source === null) return;

  const cases = new Map();
  for (const chunk of source.split(/^## Case: /gmu).slice(1)) {
    const [identifierLine = "", ...bodyLines] = chunk.split(/\r?\n/u);
    const identifier = identifierLine.trim();
    const body = bodyLines.join("\n");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(identifier)) {
      errors.push(`${evalPath}: invalid case identifier ${identifier || "<empty>"}.`);
      continue;
    }
    if (cases.has(identifier)) errors.push(`${evalPath}: duplicate case ${identifier}.`);
    cases.set(identifier, body);
  }

  for (const identifier of requiredEvalCases) {
    const body = cases.get(identifier);
    if (body === undefined) {
      errors.push(`${evalPath}: missing required evaluation case ${identifier}.`);
      continue;
    }
    for (const field of ["Prompt:", "Expected evidence:", "Fail if:"]) {
      if (!body.includes(field)) errors.push(`${evalPath}: case ${identifier} is missing ${field}`);
    }
  }
}

function readRequiredFile(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    errors.push(`${path}: required quality-skill file is missing.`);
    return null;
  }
  return readFileSync(absolute, "utf8");
}
