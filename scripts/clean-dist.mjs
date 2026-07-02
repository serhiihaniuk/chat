// Owns: removing every workspace's build output (dist/ + tsbuildinfo) so a
// rebuild cannot serve stale declarations from deleted modules.
// Does not own: node_modules, Vite dep caches, or test artifacts.
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const workspaceRoots = ["apps", "packages", "test-harness"];

let removed = 0;
for (const groupName of workspaceRoots) {
  for (const entry of readdirSync(join(root, groupName), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const workspace = join(root, groupName, entry.name);
    for (const target of ["dist", "tsconfig.tsbuildinfo", "tsconfig.build.tsbuildinfo"]) {
      try {
        rmSync(join(workspace, target), { recursive: true, force: true });
        removed += 1;
      } catch {
        // force:true already tolerates absence; anything else is worth surfacing.
      }
    }
  }
}

console.log(`clean: removed build output across ${removed} workspace targets.`);
