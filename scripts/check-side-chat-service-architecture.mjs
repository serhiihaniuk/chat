import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { failIfErrors, importSpecifiers, listSourceFiles, resolveRoot } from "./lib/governance.mjs";

const root = resolveRoot();
const sourceRoot = "apps/side-chat-service/src/";
const productionEntry = `${sourceRoot}index.ts`;
const configDeclaration = `${sourceRoot}config/declaration/side-chat-config.ts`;
const bundledConfigCatalog = `${sourceRoot}config/declaration/bundled-config-catalog.ts`;
const allowedCatalogInputs = new Set([
  "apps/side-chat-service/sidechat.config.ts",
  "apps/side-chat-service/sidechat.azure.config.ts",
  "apps/side-chat-service/sidechat.fake.config.ts",
]);
const allowedServiceEntryFiles = new Set([
  productionEntry,
  `${sourceRoot}sidechat.ts`,
  `${sourceRoot}sidechat.test.ts`,
]);
const serviceTopLevelDirectories = new Set([
  "adapters",
  "application",
  "auth",
  "composition",
  "config",
  "domain",
  "integrations",
  "testing",
  "workflows",
]);
// Each exception is one Node `use step` seam using the composition-owned store
// lifetime. Exact file/specifier pairs prevent a general composition escape.
const workflowStepBoundaryImports = new Set([
  `${sourceRoot}workflows/production/client-tool-dispatch.ts::#composition/workflow/workflow-step-store`,
  `${sourceRoot}workflows/production/chat-turn-claim.ts::#composition/workflow/workflow-step-store`,
  `${sourceRoot}workflows/production/approvals/tool-approval.ts::#composition/workflow/workflow-step-store`,
  `${sourceRoot}workflows/production/conversation-title/persist-conversation-title.ts::#composition/workflow/workflow-step-store`,
  `${sourceRoot}workflows/production/conversation-title/record-conversation-title-run.ts::#composition/workflow/workflow-step-store`,
  `${sourceRoot}workflows/production/chat-turn-finalize.ts::#composition/workflow/workflow-step-store`,
]);
const allowedWorkflowDependencies = new Set([
  "ai",
  "workflow",
  "@ai-sdk/workflow",
  // Durable workflows persist native UI messages. This zero-dependency contract
  // owns their public metadata vocabulary; it is not an outer implementation.
  "@side-chat/stream-profile",
  "@side-chat/side-chat-server",
]);
const allowedApplicationDependencies = new Set([
  "ai",
  // The application port carries the Workflow-serializable AI SDK model type.
  // Concrete provider packages remain adapter-private.
  "@ai-sdk/provider",
  "@side-chat/shared",
  "@side-chat/side-chat-server",
  "@side-chat/stream-profile",
]);
// Compatibility has its own non-production HTTP adapter. Keep its workflow
// access explicit so ordinary adapters cannot grow workflow dependencies.
const adapterWorkflowBoundaryImports = new Set([
  `${sourceRoot}adapters/http/compatibility-app.ts::#workflows/testing/compatibility-turn`,
  `${sourceRoot}adapters/http/compatibility-app.ts::#workflows/testing/chat-turn`,
  `${sourceRoot}adapters/http/compatibility-app.ts::#workflows/testing/probes/wrapper-approval-gate`,
]);
const errors = [];
const sourceFiles = listSourceFiles(root).filter(
  (file) => file.startsWith(sourceRoot) || allowedCatalogInputs.has(file),
);
const layerImportRules = {
  domain: {
    violates: (_file, specifier) => !isLocalTo(specifier, "domain"),
    message: "domain imports outward dependency",
  },
  application: {
    violates: (_file, specifier) => isApplicationOutwardImport(specifier),
    message: "application imports outward dependency",
  },
  config: {
    violates: (file, specifier) => !isConfigImport(file, specifier),
    message: "config subsystem imports outward dependency",
  },
  adapters: {
    violates: (file, specifier) => isAdapterBoundaryViolation(file, specifier),
    message: "adapter imports another outer implementation",
  },
  workflows: {
    violates: (file, specifier) => isWorkflowBoundaryViolation(file, specifier),
    message: "workflow imports forbidden outer dependency",
  },
  testing: {
    violates: (_file, specifier) => isTestingBoundaryViolation(specifier),
    message: "testing code imports production implementation",
  },
};

for (const file of sourceFiles) {
  const source = readSource(file);
  checkEnvironmentKeyLiterals(file, source);
  if (!file.startsWith(sourceRoot)) continue;

  const layer = file.slice(sourceRoot.length).split("/")[0];
  const imports = importSpecifiers(source);

  checkKnownTopLevelModule(file, layer);
  checkPlainTypeScriptBoundary(file, imports);
  checkLayerImports(file, layer, imports);
  checkPhysicalWorkflowBoundary(file, layer, source, imports);
}

function checkPlainTypeScriptBoundary(file, imports) {
  for (const specifier of imports) {
    if (specifier === "effect" || specifier.startsWith("effect/")) {
      report(file, `v7 service must not import Effect dependency ${specifier}`);
    }
  }
}

function checkKnownTopLevelModule(file, layer) {
  if (allowedServiceEntryFiles.has(file) || serviceTopLevelDirectories.has(layer)) return;
  report(file, `unknown service top-level module ${layer}`);
}

checkProductionGraph();
failIfErrors(errors);

function checkLayerImports(file, layer, imports) {
  if (file.endsWith(".test.ts")) return;
  const rule = layerImportRules[layer];
  if (!rule) return;

  for (const specifier of imports) {
    if (rule.violates(file, specifier)) report(file, `${rule.message} ${specifier}`);
  }
}

function checkPhysicalWorkflowBoundary(file, layer, source, imports) {
  if (layer !== "workflows" && /^\s*["']use (?:workflow|step)["'];/mu.test(source)) {
    report(file, `Workflow directive must live under ${sourceRoot}workflows/`);
  }

  if (layer === "workflows" || layer === "composition") return;

  for (const specifier of imports) {
    if (
      specifier === "workflow" ||
      specifier.startsWith("workflow/") ||
      specifier === "@ai-sdk/workflow"
    ) {
      report(
        file,
        `Workflow engine import ${specifier} is legal only in workflows/ or composition/`,
      );
    }
  }
}

function checkEnvironmentKeyLiterals(file, source) {
  if (file === configDeclaration || file.endsWith(".test.ts")) return;
  for (const match of source.matchAll(/["']((?:SIDECHAT|WORKFLOW)_[A-Z0-9_]+)["']/gu)) {
    report(file, `environment key ${match[1]} must use SERVICE_ENV_KEYS`);
  }
}

/** Walks real static imports so indirect testing dependencies fail the production gate. */
function checkProductionGraph() {
  const visited = new Set();
  const pending = [productionEntry];

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file) || !existsSync(join(root, file))) continue;
    visited.add(file);

    if (file !== productionEntry && isTestingOnlyProductionDependency(file)) {
      report(productionEntry, `production import graph reaches testing dependency ${file}`);
    }

    for (const specifier of importSpecifiers(readSource(file))) {
      const resolved = resolveServiceImport(file, specifier);
      if (resolved && !visited.has(resolved)) pending.push(resolved);
    }
  }
}

function isTestingOnlyProductionDependency(file) {
  if (
    file === `${sourceRoot}composition/route/testing.ts` ||
    file === `${sourceRoot}composition/route/testing-entry.ts` ||
    file === `${sourceRoot}composition/workflow/testing.ts` ||
    file === `${sourceRoot}adapters/http/compatibility-app.ts`
  ) {
    return true;
  }

  const directorySegments = file.slice(sourceRoot.length).split("/").slice(0, -1);
  return directorySegments.some(
    (segment) => segment === "testing" || segment.startsWith("testing-"),
  );
}

function resolveServiceImport(importer, specifier) {
  if (specifier === "#sidechat") return `${sourceRoot}sidechat.ts`;

  const aliases = {
    "#adapters/": `${sourceRoot}adapters/`,
    "#auth/": `${sourceRoot}auth/`,
    "#application/": `${sourceRoot}application/`,
    "#composition/": `${sourceRoot}composition/`,
    "#config/": `${sourceRoot}config/`,
    "#integrations/": `${sourceRoot}integrations/`,
    "#testing/": `${sourceRoot}testing/`,
    "#workflows/": `${sourceRoot}workflows/`,
  };

  for (const [prefix, target] of Object.entries(aliases)) {
    if (specifier.startsWith(prefix)) {
      return resolveTypeScriptFile(`${target}${specifier.slice(prefix.length)}`);
    }
  }
  if (!specifier.startsWith(".")) return undefined;
  return resolveTypeScriptFile(posix.normalize(posix.join(posix.dirname(importer), specifier)));
}

function resolveTypeScriptFile(path) {
  const withoutJavaScriptExtension = path.replace(/\.(?:m?js)$/u, "");
  for (const candidate of [
    `${withoutJavaScriptExtension}.ts`,
    `${withoutJavaScriptExtension}/index.ts`,
  ]) {
    if (existsSync(join(root, candidate))) return candidate;
  }
  return undefined;
}

function isLocalTo(specifier, layer) {
  return specifier.startsWith(".") || specifier.startsWith(`#${layer}/`);
}

function isApplicationOutwardImport(specifier) {
  if (specifier.startsWith(".")) return false;
  if (specifier.startsWith("#application/") || specifier.startsWith("#domain/")) return false;
  return !allowedApplicationDependencies.has(specifier);
}

function isConfigImport(file, specifier) {
  if (specifier === "vitest") return true;
  if (!specifier.startsWith(".")) return false;

  const resolved = resolveRelativeTypeScriptPath(file, specifier);
  if (resolved.startsWith(`${sourceRoot}config/`)) return true;
  return file === bundledConfigCatalog && allowedCatalogInputs.has(resolved);
}

function resolveRelativeTypeScriptPath(file, specifier) {
  return posix.normalize(posix.join(posix.dirname(file), specifier)).replace(/\.(?:m?js)$/u, ".ts");
}

function isAdapterBoundaryViolation(file, specifier) {
  if (specifier.startsWith("#workflows/")) {
    return !adapterWorkflowBoundaryImports.has(`${file}::${specifier}`);
  }
  if (
    specifier.startsWith("#adapters/") ||
    specifier.startsWith("#composition/") ||
    specifier.startsWith("#config/") ||
    specifier.startsWith("#testing/")
  ) {
    return true;
  }
  if (!specifier.startsWith(".")) return false;

  const importedFile = resolveRelativeTypeScriptPath(file, specifier);
  if (!importedFile.startsWith(`${sourceRoot}adapters/`)) return false;

  const importerAdapter = file.slice(`${sourceRoot}adapters/`.length).split("/")[0];
  const importedAdapter = importedFile.slice(`${sourceRoot}adapters/`.length).split("/")[0];
  return importerAdapter !== importedAdapter;
}

function isWorkflowBoundaryViolation(file, specifier) {
  if (workflowStepBoundaryImports.has(`${file}::${specifier}`)) return false;
  if (specifier.startsWith(".")) return false;
  if (specifier.startsWith("#application/")) return false;
  // Domain is the innermost pure layer with no outward dependencies, so any
  // layer may depend on it. The shared turn classifier and the finalize step
  // reference the domain turn vocabulary directly.
  if (specifier.startsWith("#domain/")) return false;
  if (specifier.startsWith("#workflows/")) return false;
  if (specifier === "#composition/workflow/production") {
    return !file.startsWith(`${sourceRoot}workflows/production/`);
  }
  if (specifier === "#composition/workflow/testing") {
    return !file.startsWith(`${sourceRoot}workflows/testing/`);
  }
  if (allowedWorkflowDependencies.has(specifier) || specifier.startsWith("workflow/")) return false;
  return !specifier.startsWith("vitest");
}

function isTestingBoundaryViolation(specifier) {
  return specifier.startsWith("#adapters/") || specifier.startsWith("#composition/");
}

function readSource(file) {
  return readFileSync(join(root, file), "utf8");
}

function report(file, message) {
  errors.push(`${file}: ${message}`);
}
