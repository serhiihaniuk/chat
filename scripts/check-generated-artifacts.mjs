import { failIfErrors, isFile, listFiles, resolveRoot } from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = resolveRoot();
const errors = [];
const expectedGeneratedArtifacts = [
  "packages/chat-protocol/src/generated/sidechat-v1.schema.generated.json",
  "docs/generated/partner-ai-service.openapi.generated.json",
];

for (const artifact of expectedGeneratedArtifacts) {
  if (!isFile(root, artifact)) {
    errors.push(`${artifact}: expected generated artifact is missing`);
  }
}

for (const file of listFiles(root)) {
  if (/\.generated\.(?:ts|tsx|js|json)$/.test(file)) {
    const source = readFileSync(join(root, file), "utf8");
    if (
      !source
        .split("\n")
        .slice(0, 5)
        .some((line) => line.includes("Generated from:"))
    ) {
      errors.push(`${file}: generated artifact must declare its generator source in the header`);
    }
  }
}

failIfErrors(errors);
