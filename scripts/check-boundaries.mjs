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
    /^@side-chat\/(partner-ai-core|agent-runtime|ai-runtime-contract|side-chat-widget|db)$/,
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
    /^@side-chat\/(partner-ai-core|agent-runtime|ai-runtime-contract|side-chat-widget|db)$/,
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
    /^@side-chat\/(agent-runtime|side-chat-widget|db)$/,
  ],
  "packages/ai-runtime-contract": [
    /^hono$/,
    /^@hono\/node-server$/,
    /^react$/,
    /^react-dom$/,
    /^pg$/,
    /^drizzle-orm$/,
    /^ai$/,
    /^@ai-sdk\//,
    /^@side-chat\/(partner-ai-core|agent-runtime|chat-protocol|side-chat-widget|db)$/,
  ],
  "packages/agent-runtime": [
    /^hono$/,
    /^@hono\/node-server$/,
    /^react$/,
    /^react-dom$/,
    /^pg$/,
    /^drizzle-orm$/,
    /^@side-chat\/(chat-protocol|side-chat-widget|db)$/,
  ],
  "packages/side-chat-widget": [
    /^hono$/,
    /^@hono\/node-server$/,
    /^effect$/,
    /^pg$/,
    /^drizzle-orm$/,
    /^@ai-sdk\/(?!react$|workflow$)/,
    /^shadcn$/,
    /^@repo\/shadcn-ui$/,
    /^@side-chat\/(partner-ai-core|agent-runtime|ai-runtime-contract|db)$/,
  ],
  "packages/db": [
    /^react$/,
    /^react-dom$/,
    /^hono$/,
    /^@hono\/node-server$/,
    /^ai$/,
    /^@ai-sdk\//,
    /^@side-chat\/(partner-ai-core|agent-runtime|ai-runtime-contract|chat-protocol|side-chat-widget)$/,
  ],
  "apps/partner-ai-service": [/^@side-chat\/side-chat-widget$/],
};

for (const file of listSourceFiles(root)) {
  if (!file.includes("/src/")) continue;

  const area = packageArea(file);
  const forbidden = forbiddenByArea[area] ?? [];
  const source = readFileSync(join(root, file), "utf8");

  for (const specifier of importSpecifiers(source)) {
    const relativeBoundaryError = relativeCrossPackageImportError(root, file, area, specifier);
    if (relativeBoundaryError) errors.push(relativeBoundaryError);

    const sourceFolderBoundaryError = relativeSourceFolderImportError(root, file, area, specifier);
    if (sourceFolderBoundaryError) errors.push(sourceFolderBoundaryError);

    const dependency = dependencyName(specifier);
    if (!dependency) continue;

    if (forbidden.some((pattern) => pattern.test(dependency))) {
      errors.push(`${file}: forbidden ${dependency} import in ${area}`);
    }
  }
}

failIfErrors(errors);

function relativeCrossPackageImportError(root, file, area, specifier) {
  if (!specifier.startsWith(".")) return undefined;

  const resolvedRelative = resolveRelativeImport(root, file, specifier);
  if (!resolvedRelative || resolvedRelative.startsWith("..")) return undefined;

  const targetArea = packageArea(resolvedRelative);
  if (targetArea === area) return undefined;
  if (!isWorkspaceArea(area) || !isWorkspaceArea(targetArea)) return undefined;

  return `${file}: relative import crosses package boundary into ${targetArea}; import ${packageNameForMessage(targetArea)} instead`;
}

function relativeSourceFolderImportError(root, file, area, specifier) {
  if (!specifier.startsWith(".")) return undefined;
  if (!isWorkspaceArea(area)) return undefined;
  if (!file.includes("/src/")) return undefined;

  const resolvedRelative = resolveRelativeImport(root, file, specifier);
  if (!resolvedRelative || resolvedRelative.startsWith("..")) return undefined;
  if (packageArea(resolvedRelative) !== area) return undefined;

  const sourceFolder = sourceTopLevelFolder(area, file);
  const targetFolder = sourceTopLevelFolder(area, resolvedRelative);
  if (!sourceFolder || !targetFolder || sourceFolder === targetFolder) {
    return undefined;
  }

  return `${file}: relative import crosses ${area}/src/${sourceFolder} into src/${targetFolder}; use package-private ${packageImportFor(area, resolvedRelative)} instead`;
}

function resolveRelativeImport(root, file, specifier) {
  const importerAbsolute = resolve(root, file);
  const resolvedAbsolute = normalize(resolve(dirname(importerAbsolute), specifier));
  return relative(root, resolvedAbsolute).split(sepForPlatform()).join("/");
}

function sourceTopLevelFolder(area, file) {
  const prefix = `${area}/src/`;
  if (!file.startsWith(prefix)) return undefined;

  const relativeSourcePath = file.slice(prefix.length);
  const firstSeparator = relativeSourcePath.indexOf("/");
  if (firstSeparator < 0) return undefined;

  return relativeSourcePath.slice(0, firstSeparator);
}

function packageImportFor(area, targetFile) {
  const targetFolder = sourceTopLevelFolder(area, targetFile);
  if (!targetFolder) return "#<package-internal>";

  const folderPrefix = `${area}/src/${targetFolder}/`;
  const rawSuffix = targetFile.startsWith(folderPrefix)
    ? targetFile.slice(folderPrefix.length)
    : "";
  const withoutExtension = rawSuffix.replace(/\.(?:c|m)?[jt]sx?$/, "");
  const suffix = withoutExtension === "index" ? "" : withoutExtension.replace(/\/index$/, "");

  return suffix ? `#${targetFolder}/${suffix}` : `#${targetFolder}`;
}

function isWorkspaceArea(area) {
  return (
    area.startsWith("packages/") || area.startsWith("apps/") || area.startsWith("test-harness/")
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
