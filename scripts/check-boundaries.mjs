import {
  dependencyName,
  failIfErrors,
  importSpecifiers,
  listSourceFiles,
  packageArea,
  resolveRoot,
} from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = resolveRoot();
const errors = [];

const forbiddenByArea = {
  "packages/chat-protocol": [
    /^react$/,
    /^react-dom$/,
    /^hono$/,
    /^@hono\/node-server$/,
    /^ai$/,
    /^@ai-sdk\//,
    /^pg$/,
    /^drizzle-orm$/,
    /^@side-chat\/(backend-core|assistant-runtime|chat-client|side-chat-widget|db)$/,
  ],
  "packages/host-bridge": [
    /^react$/,
    /^react-dom$/,
    /^hono$/,
    /^@hono\/node-server$/,
    /^pg$/,
    /^drizzle-orm$/,
    /^ai$/,
    /^@ai-sdk\//,
    /^@side-chat\/(backend-core|assistant-runtime|side-chat-widget|db)$/,
  ],
  "packages/backend-core": [
    /^hono$/,
    /^@hono\/node-server$/,
    /^react$/,
    /^react-dom$/,
    /^pg$/,
    /^drizzle-orm$/,
    /^ai$/,
    /^@ai-sdk\//,
    /^@side-chat\/(assistant-runtime|chat-client|side-chat-widget|db)$/,
  ],
  "packages/assistant-runtime": [
    /^hono$/,
    /^@hono\/node-server$/,
    /^react$/,
    /^react-dom$/,
    /^pg$/,
    /^drizzle-orm$/,
    /^@side-chat\/(chat-client|side-chat-widget|db)$/,
  ],
  "packages/chat-client": [
    /^react$/,
    /^react-dom$/,
    /^effect$/,
    /^pg$/,
    /^drizzle-orm$/,
    /^ai$/,
    /^@ai-sdk\//,
    /^@side-chat\/(backend-core|assistant-runtime|side-chat-widget|db)$/,
  ],
  "packages/side-chat-widget": [
    /^hono$/,
    /^@hono\/node-server$/,
    /^effect$/,
    /^pg$/,
    /^drizzle-orm$/,
    /^ai$/,
    /^@ai-sdk\//,
    /^lucide-react$/,
    /^ai-elements$/,
    /^shadcn$/,
    /^@repo\/shadcn-ui$/,
    /^@side-chat\/(backend-core|assistant-runtime|db)$/,
  ],
  "packages/db": [
    /^react$/,
    /^react-dom$/,
    /^hono$/,
    /^@hono\/node-server$/,
    /^ai$/,
    /^@ai-sdk\//,
    /^@side-chat\/(backend-core|assistant-runtime|chat-client|side-chat-widget)$/,
  ],
  "apps/partner-ai-service": [/^@side-chat\/side-chat-widget$/],
};

for (const file of listSourceFiles(root)) {
  if (!file.includes("/src/")) continue;

  const area = packageArea(file);
  const forbidden = forbiddenByArea[area] ?? [];
  const source = readFileSync(join(root, file), "utf8");

  for (const specifier of importSpecifiers(source)) {
    const dependency = dependencyName(specifier);
    if (!dependency) continue;

    if (forbidden.some((pattern) => pattern.test(dependency))) {
      errors.push(`${file}: forbidden ${dependency} import in ${area}`);
    }

    if (dependency === "@side-chat/testing" && area !== "packages/testing") {
      errors.push(
        `${file}: production source must not import packages/testing`,
      );
    }
  }
}

failIfErrors(errors);
