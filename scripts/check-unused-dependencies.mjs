import {
  collectDependencies,
  failIfErrors,
  listFiles,
  listWorkspacePackageJsons,
  readJson,
  resolveRoot,
} from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = resolveRoot();
const errors = [];
const ignoredDependencies = new Set([
  "@base-ui/react",
  "@tailwindcss/vite",
  "@types/node",
  "@types/pg",
  "@types/react",
  "@types/react-dom",
  "class-variance-authority",
  "clsx",
  "drizzle-kit",
  "tailwind-merge",
  "tailwindcss",
]);
const allowedUnusedDependencies = new Map([
  [
    "@side-chat/partner-ai-service:@effect/platform-node",
    "Day-one Effect v4 platform pin required by production-system-design.md.",
  ],
  [
    "@side-chat/partner-ai-service:effect",
    "Day-one Effect v4 pin required by production-system-design.md.",
  ],
  [
    "@side-chat/agent-runtime:@ai-sdk/provider",
    "Day-one AI SDK provider typing pin required by production-system-design.md.",
  ],
  [
    "@side-chat/agent-runtime:@side-chat/partner-ai-core",
    "Boundary dependency retained for runtime/core adapter convergence.",
  ],
  [
    "@side-chat/agent-runtime:effect",
    "Day-one Effect v4 pin required by production-system-design.md.",
  ],
  [
    "@side-chat/db:effect",
    "Day-one Effect v4 pin required by production-system-design.md.",
  ],
]);

const sourceFiles = listFiles(root).filter(
  (file) =>
    /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file) &&
    !/(?:^|\/)(?:dist|build|coverage|node_modules)\//.test(file),
);
const sourceTextByWorkspace = new Map();

for (const packageJsonPath of listWorkspacePackageJsons(root)) {
  const workspaceDir = dirname(packageJsonPath);
  sourceTextByWorkspace.set(
    workspaceDir,
    sourceFiles
      .filter((file) => file.startsWith(`${workspaceDir}/`))
      .map((file) => readFileSync(join(root, file), "utf8"))
      .join("\n"),
  );
}

for (const packageJsonPath of listWorkspacePackageJsons(root)) {
  const packageJson = readJson(root, packageJsonPath);
  const workspaceDir = dirname(packageJsonPath);
  const sourceText = sourceTextByWorkspace.get(workspaceDir) ?? "";
  const dependencies = collectDependencies(packageJson);

  for (const dependency of Object.keys(dependencies)) {
    if (ignoredDependencies.has(dependency)) continue;
    if (allowedUnusedDependencies.has(`${packageJson.name}:${dependency}`)) {
      continue;
    }
    if (!sourceText.includes(`"${dependency}`)) {
      errors.push(`${packageJsonPath}: dependency ${dependency} is unused`);
    }
  }
}

failIfErrors(errors);
