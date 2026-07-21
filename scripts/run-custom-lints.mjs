import { spawnSync } from "node:child_process";
import { relative } from "node:path";
import { resolveRoot } from "./lib/governance.mjs";

const root = resolveRoot();

const checks = [
  "check-version-pins.mjs",
  "check-dependency-policy.mjs",
  "check-unused-dependencies.mjs",
  "check-package-exports.mjs",
  "check-boundaries.mjs",
  "check-side-chat-service-architecture.mjs",
  "check-widget-layers.mjs",
  "check-runtime-boundaries.mjs",
  "check-outbound-rules.mjs",
  "check-undefined-optional-contracts.mjs",
  "check-code-shape.mjs",
  "check-source-governance.mjs",
  "check-agent-skills.mjs",
  "check-human-readability.mjs",
  "check-generated-artifacts.mjs",
  "check-governance-fixtures.mjs",
];

for (const check of checks) {
  const result = spawnSync(process.execPath, [`scripts/${check}`, "--root", root], {
    cwd: root,
    stdio: "inherit",
  });

  if (result.status === 0) continue;

  const displayRoot = relative(process.cwd(), root) || ".";
  console.error(
    `Custom lint failed while running ${check} for ${displayRoot}.\n` +
      `Repair prompt: run "node scripts/${check}" to inspect the focused failure, fix the reported boundary/governance issue, then rerun "npm run lint:custom".`,
  );
  process.exit(result.status ?? 1);
}
