import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ACTIVE_POSTGRES_WORLD_EXPORT =
  /\/\/#region [^\r\n]*\/node_modules\/@workflow\/world-postgres\/dist\/index\.js\r?\nvar dist_exports =/u;
const ACTIVE_WORLD_FACTORY_CALL = "createWorldFromModule(dist_exports)";

/** Production output is a separate graph; compatibility code must be physically absent. */
export function assertProductionBundleExcludesTestingCode(
  outputDirectory: string,
  providerObservationPrefix: string,
): void {
  const forbiddenMarkers = [
    "side-chat-scripted",
    providerObservationPrefix,
    "Scripted reply:",
    "/compatibility/turns",
  ];

  for (const file of outputTextFiles(outputDirectory)) {
    const source = readFileSync(file, "utf8");
    const marker = forbiddenMarkers.find((candidate) => source.includes(candidate));
    if (marker !== undefined) {
      throw new Error(`Production output contains testing marker ${marker} in ${file}`);
    }
  }
}

/**
 * Production replay is valid only when Workflow binds its active world factory
 * to Postgres. The Postgres package reuses a local-world queue helper, so mere
 * local-world module presence does not identify the selected durability store.
 */
export function assertProductionBundleUsesPostgresWorld(outputDirectory: string): void {
  let foundPostgresWorldTarget = false;
  for (const file of outputTextFiles(outputDirectory)) {
    const source = readFileSync(file, "utf8");
    if (ACTIVE_POSTGRES_WORLD_EXPORT.test(source) && source.includes(ACTIVE_WORLD_FACTORY_CALL)) {
      foundPostgresWorldTarget = true;
    }
  }
  if (!foundPostgresWorldTarget) {
    throw new Error("Production output does not target the Workflow Postgres world.");
  }
}

function outputTextFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...outputTextFiles(path));
    if (entry.isFile() && /\.(?:js|mjs|cjs|json)$/u.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}
