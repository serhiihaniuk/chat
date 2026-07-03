import { failIfErrors, listFiles, resolveRoot } from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = resolveRoot();
const errors = [];

// A file may claim to be generated only when a real generator produces it.
// Register artifacts here as `path -> generator command`; hand-maintained files
// (e.g. packages/chat-protocol/src/sidechat-v1.schema.json, the OpenAPI spec)
// must NOT be named *.generated.* — their honesty contract is a parity test or
// an update-in-same-change rule declared in their own header.
const REGISTERED_GENERATORS = new Map([]);

for (const file of listFiles(root)) {
  if (!/\.generated\.(?:ts|tsx|js|json)$/.test(file)) continue;

  if (!REGISTERED_GENERATORS.has(file)) {
    errors.push(
      `${file}: named *.generated.* but no producing generator is registered in check-generated-artifacts.mjs — ` +
        "either wire a generator and register it, or rename the file to drop the generated claim",
    );
    continue;
  }

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

failIfErrors(errors);
