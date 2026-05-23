import {
  failIfErrors,
  listFiles,
  listSourceFiles,
  resolveRoot,
} from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolveRoot();
const errors = [];
const sourceLineBudgetExceptions = new Set([
  "packages/db/src/drizzle/schema.ts",
]);
const gitLsFiles = spawnSync("git", ["ls-files"], {
  cwd: root,
  encoding: "utf8",
});
const trackedFiles =
  gitLsFiles.status === 0
    ? new Set(gitLsFiles.stdout.split("\n").filter(Boolean))
    : undefined;

for (const file of listFiles(root)) {
  if (
    /^(?:apps|packages|test-harness)\/[^/]+\/(?:dist|build|coverage)\//.test(
      file,
    ) &&
    (trackedFiles === undefined || trackedFiles.has(file))
  ) {
    errors.push(`${file}: generated build/test artifact must not be tracked`);
  }
}

for (const file of listSourceFiles(root)) {
  if (/(?:^|\/)(?:dist|build|coverage)\//.test(file)) continue;

  const source = readFileSync(join(root, file), "utf8");
  const lineCount = source.split("\n").length;
  const productionSource = file.includes("/src/");

  if (
    productionSource &&
    !file.endsWith(".test.ts") &&
    !sourceLineBudgetExceptions.has(file) &&
    lineCount > 300
  )
    errors.push(`${file}: production source file exceeds 300-line budget`);
  if (productionSource && file.endsWith(".test.ts") && lineCount > 450)
    errors.push(`${file}: test source file exceeds 450-line budget`);
  if (productionSource && /\bdebugger\b/.test(source))
    errors.push(`${file}: debugger statement is forbidden`);
  if (productionSource && /\balert\s*\(/.test(source))
    errors.push(`${file}: alert is forbidden`);
  if (/\b(?:describe|it|test)\.only\s*\(/.test(source))
    errors.push(`${file}: focused test is forbidden`);
  if (/\b(?:describe|it|test)\.skip\b/.test(source))
    errors.push(`${file}: skipped test is forbidden outside quarantine ADR`);
  if (/class\s+ToolLoopAgent\b/.test(source))
    errors.push(`${file}: local ToolLoopAgent class shadows AI SDK export`);
}

failIfErrors(errors);
