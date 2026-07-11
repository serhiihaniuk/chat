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
    "@side-chat/agent-runtime:effect",
    "Day-one Effect v4 pin required by production-system-design.md.",
  ],
  [
    "@side-chat/agent-runtime:zod",
    "AI SDK provider-utils peer dependency required by provider runtime execution.",
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
  [
    "@side-chat/docs:@types/mdx",
    "Docs MDX component typing is provided through the virtual mdx/types module.",
  ],
  [
    "@side-chat/docs:@react-router/node",
    "React Router dev/build default server runtime loads this package when the docs app has no custom server entry.",
  ],
  [
    "@side-chat/docs:isbot",
    "React Router node runtime uses this SSR crawler dependency through its generated server entry.",
  ],
  ["@side-chat/docs:oxlint", "Package-local lint script invokes the oxlint CLI."],
  ["@side-chat/docs:serve", "Package-local start script serves the built docs output."],
  ["@side-chat/docs:typescript", "Package-local typecheck script invokes tsc."],
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
