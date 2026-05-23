import {
  dependencyName,
  failIfErrors,
  importSpecifiers,
  listSourceFiles,
  packageArea,
  resolveRoot,
} from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

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
    /^@side-chat\/(partner-ai-core|agent-runtime|chat-client|side-chat-widget|db)$/,
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
    /^@side-chat\/(partner-ai-core|agent-runtime|side-chat-widget|db)$/,
  ],
  "packages/partner-ai-core": [
    /^hono$/,
    /^@hono\/node-server$/,
    /^react$/,
    /^react-dom$/,
    /^pg$/,
    /^drizzle-orm$/,
    /^ai$/,
    /^@ai-sdk\//,
    /^@side-chat\/(agent-runtime|chat-client|side-chat-widget|db)$/,
  ],
  "packages/agent-runtime": [
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
    /^@side-chat\/(partner-ai-core|agent-runtime|side-chat-widget|db)$/,
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
    /^@side-chat\/(partner-ai-core|agent-runtime|db)$/,
  ],
  "packages/db": [
    /^react$/,
    /^react-dom$/,
    /^hono$/,
    /^@hono\/node-server$/,
    /^ai$/,
    /^@ai-sdk\//,
    /^@side-chat\/(partner-ai-core|agent-runtime|chat-client|side-chat-widget)$/,
  ],
  "apps/partner-ai-service": [/^@side-chat\/side-chat-widget$/],
};

for (const file of listSourceFiles(root)) {
  if (!file.includes("/src/")) continue;

  const area = packageArea(file);
  const forbidden = forbiddenByArea[area] ?? [];
  const source = readFileSync(join(root, file), "utf8");

  for (const specifier of importSpecifiers(source)) {
    const relativeBoundaryError = relativeCrossPackageImportError(
      root,
      file,
      area,
      specifier,
    );
    if (relativeBoundaryError) errors.push(relativeBoundaryError);

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

function relativeCrossPackageImportError(root, file, area, specifier) {
  if (!specifier.startsWith(".")) return undefined;

  const importerAbsolute = resolve(root, file);
  const resolvedAbsolute = normalize(
    resolve(dirname(importerAbsolute), specifier),
  );
  const resolvedRelative = relative(root, resolvedAbsolute)
    .split(sepForPlatform())
    .join("/");

  if (resolvedRelative.startsWith("..")) return undefined;

  const targetArea = packageArea(resolvedRelative);
  if (targetArea === area) return undefined;
  if (!isWorkspaceArea(area) || !isWorkspaceArea(targetArea)) return undefined;

  return `${file}: relative import crosses package boundary into ${targetArea}; import ${packageNameForMessage(targetArea)} instead`;
}

function isWorkspaceArea(area) {
  return (
    area.startsWith("packages/") ||
    area.startsWith("apps/") ||
    area.startsWith("test-harness/")
  );
}

function packageNameForMessage(area) {
  if (area.startsWith("packages/")) {
    return `@side-chat/${area.slice("packages/".length)}`;
  }
  return area;
}

function sepForPlatform() {
  return process.platform === "win32" ? "\\" : "/";
}
