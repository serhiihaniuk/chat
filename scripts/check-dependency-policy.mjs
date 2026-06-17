import {
  collectDependencies,
  failIfErrors,
  listWorkspacePackageJsons,
  readJson,
  resolveRoot,
} from "./lib/governance.mjs";

const root = resolveRoot();
const errors = [];

const forbidden = new Set(["shadcn", "@repo/shadcn-ui"]);
const allowed = {
  "@side-chat/partner-ai-service": new Set([
    "@effect/platform-node",
    "@hono/node-server",
    "@side-chat/agent-runtime",
    "@side-chat/ai-runtime-contract",
    "@side-chat/partner-ai-core",
    "@side-chat/chat-protocol",
    "@side-chat/db",
    "@side-chat/shared",
    "effect",
    "hono",
  ]),
  "@side-chat/agent-runtime": new Set([
    "@ai-sdk/openai",
    "@ai-sdk/provider",
    "@side-chat/ai-runtime-contract",
    "@side-chat/shared",
    "ai",
    "effect",
    "zod",
  ]),
  "@side-chat/partner-ai-core": new Set([
    "@side-chat/ai-runtime-contract",
    "@side-chat/chat-protocol",
    "@side-chat/shared",
    "effect",
  ]),
  "@side-chat/ai-runtime-contract": new Set(["@side-chat/shared", "effect"]),
  "@side-chat/chat-protocol": new Set(["@side-chat/shared"]),
  "@side-chat/shared": new Set(),
  "@side-chat/db": new Set(["@side-chat/shared", "@types/pg", "drizzle-kit", "drizzle-orm", "pg"]),
  "@side-chat/host-bridge": new Set(["@side-chat/chat-protocol", "@side-chat/shared"]),
  "@side-chat/side-chat-widget": new Set([
    "@base-ui/react",
    "@side-chat/chat-protocol",
    "@side-chat/host-bridge",
    "@side-chat/shared",
    "@streamdown/cjk",
    "@streamdown/code",
    "@streamdown/math",
    "@streamdown/mermaid",
    "@tanstack/react-query",
    "ai",
    "clsx",
    "embla-carousel-react",
    "lucide-react",
    "motion",
    "nanoid",
    "react",
    "react-dom",
    "shiki",
    "streamdown",
    "tailwind-merge",
    "use-stick-to-bottom",
  ]),
  "@side-chat/testing": new Set(["@side-chat/chat-protocol"]),
  "@side-chat/adoption-harness": new Set([
    "@side-chat/chat-protocol",
    "@side-chat/db",
    "@side-chat/partner-ai-core",
    "@side-chat/partner-ai-service",
    "@side-chat/side-chat-widget",
    "effect",
  ]),
  "@side-chat/widget-harness": new Set([
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
    errors.push(`${packageJsonPath}: package ${packageJson.name} has no dependency policy entry`);

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
