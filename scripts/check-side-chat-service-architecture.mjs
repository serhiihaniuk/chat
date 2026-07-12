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
    violates: (_file, specifier) => isAdapterBoundaryViolation(specifier),
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

  checkLayerImports(file, layer, imports);
  checkPhysicalWorkflowBoundary(file, layer, source, imports);
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
  return (
    file.startsWith(`${sourceRoot}testing/`) ||
    file === `${sourceRoot}composition/route/testing.ts` ||
    file === `${sourceRoot}composition/route/testing-entry.ts` ||
    file === `${sourceRoot}composition/workflow/testing.ts` ||
    file === `${sourceRoot}adapters/http/compatibility-app.ts` ||
    file.startsWith(`${sourceRoot}workflows/testing/`)
  );
}

function resolveServiceImport(importer, specifier) {
  const aliases = {
    "#adapters/": `${sourceRoot}adapters/`,
    "#application/": `${sourceRoot}application/`,
    "#composition/": `${sourceRoot}composition/`,
    "#config/": `${sourceRoot}config/`,
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
  return (
    specifier.startsWith("#adapters/") ||
    specifier.startsWith("#composition/") ||
    specifier.startsWith("#config/") ||
    specifier.startsWith("#testing/") ||
    specifier.startsWith("#workflows/") ||
    specifier === "hono" ||
    specifier === "workflow" ||
    specifier.startsWith("workflow/") ||
    specifier.startsWith("@ai-sdk/workflow") ||
    specifier.startsWith("@workflow/") ||
    specifier.startsWith("node:")
  );
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

function isAdapterBoundaryViolation(specifier) {
  return (
    specifier.startsWith("#adapters/") ||
    specifier.startsWith("#composition/") ||
    specifier.startsWith("#config/") ||
    specifier.startsWith("#testing/")
  );
}

function isWorkflowBoundaryViolation(file, specifier) {
  if (
    file === `${sourceRoot}workflows/production/client-tool-dispatch.ts` &&
    specifier === "#composition/workflow/client-tool-store"
  ) {
    // This exact import is a Node-only store factory called directly inside
    // one `use step` activity; widening it would leak adapters into workflows.
    return false;
  }
  if (
    file === `${sourceRoot}workflows/production/approvals/tool-approval.ts` &&
    specifier === "#composition/workflow/tool-approval-store"
  ) {
    // The approval state machine uses the same pool-owning Node step seam as
    // client-tool dispatch; workflow-realm code still cannot import adapters.
    return false;
  }
  if (
    file === `${sourceRoot}workflows/production/conversation-title/persist-conversation-title.ts` &&
    specifier === "#adapters/persistence/postgres-turn-state"
  ) {
    return false;
  }
  if (
    file ===
      `${sourceRoot}workflows/production/conversation-title/record-conversation-title-run.ts` &&
    specifier === "#adapters/persistence/postgres-turn-state"
  ) {
    // Same Node `use step` pool-owning seam as persist-conversation-title.ts.
    return false;
  }
  if (
    file === `${sourceRoot}workflows/production/chat-turn-finalize.ts` &&
    specifier === "#adapters/persistence/postgres-turn-state"
  ) {
    // The durable finalize step owns and closes its own pool inside one Node
    // `use step` activity, the same seam persist-conversation-title.ts uses.
    return false;
  }
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
  if (specifier === "ai" || specifier === "workflow" || specifier.startsWith("workflow/")) {
    return false;
  }
  if (specifier === "@ai-sdk/workflow") return false;
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
