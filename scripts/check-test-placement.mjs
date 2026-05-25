import { failIfErrors, listFiles, resolveRoot } from "./lib/governance.mjs";

const root = resolveRoot();
const errors = [];

for (const file of listFiles(root, (path) =>
  /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(path),
)) {
  const parts = file.split("/");
  if (parts.includes("dist") || parts.includes("build")) continue;

  if (parts.includes("test") || parts.includes("tests")) {
    errors.push(
      `${file}: ordinary tests must be colocated beside source, not in test/tests folders`,
    );
  }

  const isHarness = file.startsWith("test-harness/");
  const isColocatedSourceTest = file.includes("/src/");
  if (!isHarness && !isColocatedSourceTest && !file.startsWith("scripts/")) {
    errors.push(
      `${file}: tests must be colocated under src or live in test-harness`,
    );
  }
}

failIfErrors(errors);
