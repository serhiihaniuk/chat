import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import {
  dependencyName,
  failIfErrors,
  importSpecifiers,
  listSourceFiles,
  resolveRoot,
} from "./lib/governance.mjs";

const root = resolveRoot();
const widgetArea = "packages/side-chat-widget";
const widgetSourceRoot = `${widgetArea}/src`;
const errors = [];

const removedTopLevelFolders = ["application", "assets", "domain", "ui"];
const blockedFixtureText = ["Context 26%", "Current page", "GPT 5.5", "Workspace context"];

for (const folder of removedTopLevelFolders) {
  if (existsSync(join(root, widgetSourceRoot, folder))) {
    errors.push(
      `${widgetSourceRoot}/${folder}: widget source must use app/features/entities/shared`,
    );
  }
}

for (const file of listSourceFiles(root)) {
  if (!file.startsWith(`${widgetSourceRoot}/`)) continue;

  if (file === `${widgetSourceRoot}/index.ts`) {
    validatePublicEntrypoint(file);
    continue;
  }

  const source = readFileSync(join(root, file), "utf8");
  const from = classifySourceFile(file);

  if (!from) {
    errors.push(`${file}: widget source must live under app, features, entities, or shared`);
    continue;
  }

  for (const text of blockedFixtureText) {
    if (source.includes(text)) {
      errors.push(`${file}: fake widget fixture text is not allowed: ${text}`);
    }
  }

  for (const specifier of importSpecifiers(source)) {
    if (/^#(?:application|domain|ui)(?:\/|$)/.test(specifier)) {
      errors.push(`${file}: obsolete widget import alias ${specifier}`);
      continue;
    }

    const dependency = dependencyName(specifier);
    if (from.layer === "shared" && dependency?.startsWith("@side-chat/")) {
      errors.push(`${file}: shared widget code must not import product package ${dependency}`);
    }

    const target = classifyImportTarget(file, specifier);
    if (!target) continue;

    const error = validateLayerImport(file, from, target, specifier);
    if (error) errors.push(error);
  }
}

failIfErrors(errors);

function validatePublicEntrypoint(file) {
  const source = readFileSync(join(root, file), "utf8");
  for (const specifier of importSpecifiers(source)) {
    if (specifier !== "./app/side-chat-widget.js") {
      errors.push(`${file}: public widget entrypoint may only export the app-level API`);
    }
  }
}

function classifySourceFile(file) {
  const prefix = `${widgetSourceRoot}/`;
  const relativePath = file.startsWith(prefix) ? file.slice(prefix.length) : "";
  return classifyWidgetPath(relativePath);
}

function classifyImportTarget(file, specifier) {
  if (specifier.startsWith("#")) return classifyPackageImport(specifier);
  if (!specifier.startsWith(".")) return undefined;

  const importerAbsolute = resolve(root, file);
  const sourceRootAbsolute = resolve(root, widgetSourceRoot);
  const targetAbsolute = normalize(resolve(dirname(importerAbsolute), specifier));
  const targetRelative = relative(sourceRootAbsolute, targetAbsolute)
    .split(sepForPlatform())
    .join("/");

  if (targetRelative.startsWith("..")) return undefined;
  return classifyWidgetPath(targetRelative);
}

function classifyPackageImport(specifier) {
  const parts = specifier.slice(1).split("/");
  const [layer, slice] = parts;
  if (!layer) return undefined;
  return classifyLayerAndSlice(layer, slice);
}

function classifyWidgetPath(path) {
  const [layer, slice] = path.split("/");
  if (!layer) return undefined;
  return classifyLayerAndSlice(layer, slice);
}

function classifyLayerAndSlice(layer, slice) {
  if (layer === "app" || layer === "shared") return { layer };
  if (layer === "features" || layer === "entities") {
    return slice ? { layer, slice } : undefined;
  }
  return undefined;
}

function validateLayerImport(file, from, target, specifier) {
  switch (from.layer) {
    case "app":
      return undefined;
    case "features":
      return validateFeatureImport(file, from, target, specifier);
    case "entities":
      return validateEntityImport(file, from, target, specifier);
    case "shared":
      return validateSharedImport(file, target, specifier);
  }

  return undefined;
}

function validateFeatureImport(file, from, target, specifier) {
  if (target.layer === "app") {
    return `${file}: feature code must not import app code through ${specifier}`;
  }
  if (target.layer === "features" && target.slice !== undefined && target.slice !== from.slice) {
    return `${file}: feature ${from.slice} must not import feature ${target.slice} through ${specifier}`;
  }
  return undefined;
}

function validateEntityImport(file, from, target, specifier) {
  if (target.layer === "shared") return undefined;
  if (target.layer === "entities" && target.slice === from.slice) {
    return undefined;
  }
  return `${file}: entity code may only import its own entity or shared code through ${specifier}`;
}

function validateSharedImport(file, target, specifier) {
  if (target.layer === "shared") return undefined;
  return `${file}: shared widget code must not import ${target.layer} through ${specifier}`;
}

function sepForPlatform() {
  return process.platform === "win32" ? "\\" : "/";
}
