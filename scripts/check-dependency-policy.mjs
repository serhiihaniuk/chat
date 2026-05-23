import {
  collectDependencies,
  failIfErrors,
  listWorkspacePackageJsons,
  readJson,
  resolveRoot,
} from "./lib/governance.mjs";

const root = resolveRoot();
const errors = [];

const forbidden = new Set([
  "lucide-react",
  "ai-elements",
  "shadcn",
  "@repo/shadcn-ui",
]);
const allowed = {
  "@side-chat/partner-ai-service": new Set([
    "@effect/platform-node",
    "@hono/node-server",
    "@side-chat/assistant-runtime",
    "@side-chat/backend-core",
    "@side-chat/chat-protocol",
    "@side-chat/db",
    "effect",
    "hono",
  ]),
  "@side-chat/assistant-runtime": new Set([
    "@ai-sdk/provider",
    "@side-chat/backend-core",
    "@side-chat/chat-protocol",
    "ai",
    "effect",
  ]),
  "@side-chat/backend-core": new Set(["@side-chat/chat-protocol", "effect"]),
  "@side-chat/chat-client": new Set(["@side-chat/chat-protocol"]),
  "@side-chat/chat-protocol": new Set(),
  "@side-chat/db": new Set([
    "@side-chat/chat-protocol",
    "@types/pg",
    "drizzle-kit",
    "drizzle-orm",
    "effect",
    "pg",
  ]),
  "@side-chat/host-bridge": new Set(["@side-chat/chat-protocol"]),
  "@side-chat/side-chat-widget": new Set([
    "@base-ui/react",
    "@side-chat/chat-client",
    "@side-chat/chat-protocol",
    "@side-chat/host-bridge",
    "class-variance-authority",
    "clsx",
    "react",
    "react-dom",
    "tailwind-merge",
  ]),
  "@side-chat/testing": new Set(),
  "@side-chat/widget-harness": new Set([
    "@side-chat/chat-client",
    "@side-chat/chat-protocol",
    "@side-chat/host-bridge",
    "@side-chat/side-chat-widget",
    "@tailwindcss/vite",
    "@vitejs/plugin-react",
    "react",
    "react-dom",
    "tailwindcss",
    "vite",
  ]),
};

for (const packageJsonPath of listWorkspacePackageJsons(root)) {
  const packageJson = readJson(root, packageJsonPath);
  const dependencies = collectDependencies(packageJson);
  const allowedForPackage = allowed[packageJson.name];

  if (!allowedForPackage)
    errors.push(
      `${packageJsonPath}: package ${packageJson.name} has no dependency policy entry`,
    );

  for (const dependency of Object.keys(dependencies)) {
    if (forbidden.has(dependency))
      errors.push(`${packageJsonPath}: forbidden UI dependency ${dependency}`);
    if (allowedForPackage && !allowedForPackage.has(dependency)) {
      errors.push(
        `${packageJsonPath}: dependency ${dependency} is not allowed for ${packageJson.name}`,
      );
    }
  }
}

failIfErrors(errors);
