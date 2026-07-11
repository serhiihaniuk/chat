import { readFileSync } from "node:fs";
import { join } from "node:path";

import { failIfErrors, importSpecifiers, listSourceFiles, resolveRoot } from "./lib/governance.mjs";

const root = resolveRoot();
const serviceSource = "apps/side-chat-service/src/";
const errors = [];

for (const file of listSourceFiles(root)) {
  if (!file.startsWith(serviceSource)) continue;
  const layer = file.slice(serviceSource.length).split("/")[0];
  const imports = importSpecifiers(readFileSync(join(root, file), "utf8"));

  for (const specifier of imports) {
    if (layer === "ports" && !isAllowedPortImport(specifier)) {
      errors.push(`${file}: port imports outward dependency ${specifier}`);
    }
    if (layer === "application" && isApplicationOutwardImport(specifier)) {
      errors.push(`${file}: application imports outward dependency ${specifier}`);
    }
    if (layer === "adapters" && specifier.startsWith("#bootstrap/")) {
      errors.push(`${file}: adapter imports bootstrap dependency ${specifier}`);
    }
  }
}

failIfErrors(errors);

function isAllowedPortImport(specifier) {
  return specifier.startsWith(".") || specifier.startsWith("#ports/");
}

function isApplicationOutwardImport(specifier) {
  return (
    specifier.startsWith("#adapters/") ||
    specifier.startsWith("#bootstrap/") ||
    specifier === "hono" ||
    specifier === "ai" ||
    specifier === "workflow" ||
    specifier.startsWith("@ai-sdk/") ||
    specifier.startsWith("@workflow/") ||
    specifier.startsWith("node:")
  );
}
