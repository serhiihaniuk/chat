import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
