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
  "@side-chat/docs": new Set([
    "@side-chat/side-chat-widget",
    "@tailwindcss/vite",
    "@vitejs/plugin-react",
    "lucide-react",
    "react",
    "react-dom",
    "tailwindcss",
    "vite",
  ]),
  "@side-chat/side-chat-service": new Set([
    "@ai-sdk/azure",
    "@ai-sdk/deepseek",
    "@ai-sdk/openai",
    "@ai-sdk/otel",
    "@ai-sdk/provider",
    "@ai-sdk/workflow",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/resources",
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/semantic-conventions",
    "@workflow/serde",
    "@workflow/world-postgres",
    "@side-chat/db",
    "@side-chat/side-chat-server",
    "@side-chat/stream-profile",
    "ai",
    "hono",
    "nitro",
    "rollup",
    "workflow",
    "zod",
  ]),
  "@side-chat/shared": new Set(),
  "@side-chat/side-chat-server": new Set(["@side-chat/shared"]),
  "@side-chat/stream-profile": new Set(),
  "@side-chat/db": new Set(["@side-chat/shared", "@types/pg", "drizzle-kit", "drizzle-orm", "pg"]),
  "@side-chat/host-bridge": new Set(["@side-chat/shared"]),
  "@side-chat/side-chat-widget": new Set([
    "@ai-sdk/workflow",
    "@base-ui/react",
    "@side-chat/host-bridge",
    "@side-chat/shared",
    "@side-chat/stream-profile",
    "@tanstack/react-query",
    "ai",
    "clsx",
    "lucide-react",
    "react",
    "react-dom",
    "streamdown",
    "tailwind-merge",
    "use-stick-to-bottom",
  ]),
  "@side-chat/widget-harness": new Set([
    "@side-chat/host-bridge",
    "@side-chat/shared",
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
