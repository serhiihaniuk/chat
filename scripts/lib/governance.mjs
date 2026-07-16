import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";

const ignoredDirectories = new Set([
  ".git",
  ".nitro",
  ".omx",
  ".output",
  ".playwright-mcp",
  ".reference",
  ".workflow-data",
  "dist",
  "node_modules",
]);

function isIgnoredDirectory(name) {
  return ignoredDirectories.has(name) || name.startsWith("node_modules.");
}

export function resolveRoot(argv = process.argv.slice(2)) {
  const index = argv.indexOf("--root");
  return index >= 0 && argv[index + 1] ? argv[index + 1] : process.cwd();
}

export function readJson(root, path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

export function writeJson(path, value) {
  mkdirSync(path.slice(0, path.lastIndexOf(sep)), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function listFiles(root, predicate = () => true, current = root) {
  if (!existsSync(current)) return [];
  const entries = readdirSync(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = join(current, entry.name);
    const rel = relative(root, absolute);

    if (entry.isDirectory()) {
      if (!isIgnoredDirectory(entry.name)) {
        files.push(...listFiles(root, predicate, absolute));
      }
      continue;
    }

    if (entry.isFile() && predicate(rel)) files.push(rel.split(sep).join("/"));
  }

  return files;
}

export function listSourceFiles(root) {
  return listFiles(root, (file) => /\.(?:cjs|mjs|js|jsx|ts|tsx)$/.test(file));
}

export function listWorkspacePackageJsons(root) {
  const roots = ["apps", "packages", "test-harness"];
  const paths = [];

  for (const workspaceRoot of roots) {
    const absoluteRoot = join(root, workspaceRoot);
    if (!existsSync(absoluteRoot)) continue;

    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const packageJson = join(workspaceRoot, entry.name, "package.json").split(sep).join("/");
        if (existsSync(join(root, packageJson))) paths.push(packageJson);
      }
    }
  }

  return paths.sort();
}

export function packageArea(file) {
  const parts = file.split("/");
  if (parts[0] === "packages" && parts[1]) return `packages/${parts[1]}`;
  if (parts[0] === "apps" && parts[1]) return `apps/${parts[1]}`;
  if (parts[0] === "test-harness" && parts[1]) return `test-harness/${parts[1]}`;
  return parts[0] ?? "";
}

export function importSpecifiers(source) {
  const specs = [];
  const patterns = [
    /import\s+(?:type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /export\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specs.push(match[1]);
    }
  }

  return specs;
}

export function dependencyName(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

export function collectDependencies(packageJson) {
  return {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
    ...packageJson.optionalDependencies,
  };
}

export function isExactVersion(version) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version);
}

export function packageManagerVersion(packageManager, name) {
  const prefix = `${name}@`;
  return typeof packageManager === "string" && packageManager.startsWith(prefix)
    ? packageManager.slice(prefix.length)
    : null;
}

export function versionSatisfiesRange(version, range) {
  if (typeof version !== "string" || typeof range !== "string") return false;

  const comparators = range.trim().split(/\s+/).filter(Boolean);
  if (comparators.length === 0) return false;

  return comparators.every((comparator) => versionSatisfiesComparator(version, comparator));
}

function versionSatisfiesComparator(version, comparator) {
  if (isExactVersion(comparator)) return compareVersions(version, comparator) === 0;

  const match = /^(>=|>|<=|<|=)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(comparator);
  if (!match) return false;

  const comparison = compareVersions(version, match[2]);
  switch (match[1]) {
    case ">=":
      return comparison >= 0;
    case ">":
      return comparison > 0;
    case "<=":
      return comparison <= 0;
    case "<":
      return comparison < 0;
    case "=":
      return comparison === 0;
    default:
      return false;
  }
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return Number.NaN;

  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return difference;
  }

  return 0;
}

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function failIfErrors(errors) {
  if (errors.length === 0) return;

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

export function makeFixtureRoot() {
  const root = join(
    tmpdir(),
    `side-chat-governance-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(root, { recursive: true });
  return root;
}

export function removeFixtureRoot(root) {
  if (root.includes("side-chat-governance-")) rmSync(root, { recursive: true, force: true });
}

export function writeFixtureFile(root, path, content) {
  const absolute = join(root, path);
  mkdirSync(absolute.slice(0, absolute.lastIndexOf(sep)), { recursive: true });
  writeFileSync(absolute, content);
}

export function runNodeScript(scriptPath, root) {
  return spawnSync(process.execPath, [scriptPath, "--root", root], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

export function isFile(root, path) {
  return existsSync(join(root, path)) && statSync(join(root, path)).isFile();
}
