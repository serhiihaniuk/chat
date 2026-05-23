import { failIfErrors, listFiles, resolveRoot } from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = resolveRoot();
const errors = [];

for (const file of listFiles(root)) {
  if (/\.generated\.(?:ts|tsx|js|json)$/.test(file)) {
    const source = readFileSync(join(root, file), "utf8");
    if (
      !source
        .split("\n")
        .slice(0, 5)
        .some((line) => line.includes("Generated from:"))
    ) {
      errors.push(
        `${file}: generated artifact must declare its generator source in the header`,
      );
    }
  }
}

failIfErrors(errors);
