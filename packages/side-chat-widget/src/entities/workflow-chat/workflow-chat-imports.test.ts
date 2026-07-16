import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const widgetSource = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflowRoots = [
  resolve(widgetSource, "entities/workflow-chat"),
  resolve(widgetSource, "features/workflow-chat"),
  resolve(widgetSource, "widgets/side-chat/ui/workflow"),
];
const workflowFiles = workflowRoots.flatMap(listProductionTypeScriptFiles);
const removedLegacyModules = [
  "widget-reconnect-triggers",
  "widget-run-controller",
  "widget-run-marker",
  "widget-transport-recovery",
] as const;

describe("workflow chat import boundary", () => {
  it.each(workflowFiles)("keeps %s browser-safe", (file) => {
    const source = readFileSync(resolve(widgetSource, file), "utf8");

    expect(source).not.toMatch(/from ["']node:/u);
    expect(source).not.toMatch(/from ["']effect["']/u);
    expect(source).not.toContain("@ai-sdk/react");
    expect(source).not.toMatch(/@ai-sdk\/(?:anthropic|azure|google|openai|provider)/u);
    for (const removedModule of removedLegacyModules) {
      expect(source).not.toContain(removedModule);
    }
  });
});

function listProductionTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return listProductionTypeScriptFiles(path);
    if (!isProductionTypeScriptFile(entry.name)) return [];
    return [relative(widgetSource, path)];
  });
}

function isProductionTypeScriptFile(file: string): boolean {
  const extension = extname(file);
  return (extension === ".ts" || extension === ".tsx") && !file.includes(".test.");
}
