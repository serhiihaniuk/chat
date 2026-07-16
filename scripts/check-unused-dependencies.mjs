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
    if (!sourceText.includes(`"${dependency}`) && !sourceText.includes(`'${dependency}`)) {
      errors.push(`${packageJsonPath}: dependency ${dependency} is unused`);
    }
  }
}

failIfErrors(errors);
