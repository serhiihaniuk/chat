import {
  collectDependencies,
  dependencyName,
  failIfErrors,
  importSpecifiers,
  listFiles,
  listWorkspacePackageJsons,
  readJson,
  resolveRoot,
} from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";

const root = resolveRoot();
const errors = [];
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);
const ignoredDependencies = new Set([
  "@base-ui/react",
  "@tailwindcss/vite",
  "@types/node",
  "@types/pg",
  "@types/react",
  "@types/react-dom",
  "clsx",
  "drizzle-kit",
  "tailwind-merge",
  "tailwindcss",
]);
const allowedUnusedDependencies = new Map([
  [
    "@side-chat/side-chat-service:@ai-sdk/deepseek",
    "Azure imports its DeepSeek compatibility model at runtime; declaring the exact transitive pin keeps clean npm workspace installs complete.",
  ],
  [
    "@side-chat/side-chat-service:rollup",
    "Nitro's server build requires its optional rollup peer at build time.",
  ],
  [
    "@side-chat/side-chat-service:@workflow/world-postgres",
    "Durable-world module resolved at build time via WORKFLOW_TARGET_WORLD for production builds; never imported from source.",
  ],
  [
    "@side-chat/side-chat-widget:react-dom",
    "Widget declares React DOM as a peer for host applications but does not import it directly.",
  ],
]);

const sourceFiles = listFiles(root).filter(
  (file) =>
    /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file) &&
    !/(?:^|\/)(?:dist|build|coverage|node_modules)\//.test(file),
);
const workspacePackageJsonPaths = listWorkspacePackageJsons(root);
const workspacePackageNames = new Set(
  workspacePackageJsonPaths.map((packageJsonPath) => readJson(root, packageJsonPath).name),
);
const sourceTextByWorkspace = new Map();
const dependencyImportFilesByWorkspace = new Map();

for (const packageJsonPath of workspacePackageJsonPaths) {
  const workspaceDir = dirname(packageJsonPath);
  const workspaceSourceFiles = sourceFiles.filter((file) => file.startsWith(`${workspaceDir}/`));
  sourceTextByWorkspace.set(
    workspaceDir,
    workspaceSourceFiles.map((file) => readFileSync(join(root, file), "utf8")).join("\n"),
  );
  dependencyImportFilesByWorkspace.set(
    workspaceDir,
    collectDependencyImportFiles(workspaceSourceFiles),
  );
}

for (const packageJsonPath of workspacePackageJsonPaths) {
  const packageJson = readJson(root, packageJsonPath);
  const workspaceDir = dirname(packageJsonPath);
  const sourceText = sourceTextByWorkspace.get(workspaceDir) ?? "";
  const dependencies = collectDependencies(packageJson);
  const dependencyImportFiles = dependencyImportFilesByWorkspace.get(workspaceDir) ?? new Map();

  for (const [dependency, importFiles] of dependencyImportFiles) {
    if (dependency === packageJson.name || Object.hasOwn(dependencies, dependency)) continue;
    if (!workspacePackageNames.has(dependency) && importFiles.every(isCentralTestFile)) continue;
    errors.push(`${packageJsonPath}: imported dependency ${dependency} is not declared`);
  }

  for (const dependency of Object.keys(dependencies)) {
    if (ignoredDependencies.has(dependency)) continue;
    if (allowedUnusedDependencies.has(`${packageJson.name}:${dependency}`)) {
      continue;
    }
    if (!sourceText.includes(`"${dependency}`) && !sourceText.includes(`'${dependency}`)) {
      errors.push(`${packageJsonPath}: dependency ${dependency} is unused`);
    }
  }
}

failIfErrors(errors);

function collectDependencyImportFiles(files) {
  const imports = new Map();

  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    for (const specifier of importSpecifiers(source)) {
      const dependency = dependencyName(specifier);
      if (dependency === null || nodeBuiltins.has(dependency)) continue;

      const importFiles = imports.get(dependency) ?? [];
      importFiles.push(file);
      imports.set(dependency, importFiles);
    }
  }

  return imports;
}

function isCentralTestFile(file) {
  return (
    /(?:^|\/)(?:e2e|testing)(?:\/|$)/.test(file) ||
    /(?:\.test|\.spec|\.integration\.test|[.-]test-env|\.test-support)\.[cm]?[jt]sx?$/.test(file)
  );
}
