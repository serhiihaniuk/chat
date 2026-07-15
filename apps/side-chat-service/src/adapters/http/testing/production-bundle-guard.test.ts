import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { assertProductionBundleUsesPostgresWorld } from "./production-bundle-guard.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("production Workflow world bundle guard", () => {
  it("accepts Postgres World and rejects the silent local-world fallback", () => {
    const postgresOutput = outputWith(activeWorldSource("@workflow/world-postgres"));
    expect(() => assertProductionBundleUsesPostgresWorld(postgresOutput)).not.toThrow();

    const localOutput = outputWith(activeWorldSource("@workflow/world-local"));
    expect(() => assertProductionBundleUsesPostgresWorld(localOutput)).toThrow(
      /does not target the Workflow Postgres world/u,
    );
  });

  it("allows the local queue helper transitively imported by Postgres World", () => {
    const output = outputWith(
      [
        "//#region ../../node_modules/@workflow/world-local/dist/index.js\nfunction createWorld$2() {}",
        activeWorldSource("@workflow/world-postgres"),
      ].join("\n"),
    );
    expect(() => assertProductionBundleUsesPostgresWorld(output)).not.toThrow();
  });

  it("rejects local World as the active factory even when Postgres code is present", () => {
    const output = outputWith(
      [
        "//#region ../../node_modules/@workflow/world-postgres/dist/index.js\nfunction createWorld$1() {}",
        activeWorldSource("@workflow/world-local"),
      ].join("\n"),
    );
    expect(() => assertProductionBundleUsesPostgresWorld(output)).toThrow(
      /does not target the Workflow Postgres world/u,
    );
  });

  it("rejects an output that contains no concrete Postgres World module", () => {
    const output = outputWith("const world = 'unknown';");
    expect(() => assertProductionBundleUsesPostgresWorld(output)).toThrow(
      /does not target the Workflow Postgres world/u,
    );
  });
});

function activeWorldSource(packageName: string): string {
  return [
    `//#region ../../node_modules/${packageName}/dist/index.js`,
    "var dist_exports = {};",
    "const world = createWorldFromModule(dist_exports);",
  ].join("\n");
}

function outputWith(source: string): string {
  const directory = mkdtempSync(join(tmpdir(), "side-chat-production-bundle-"));
  temporaryDirectories.push(directory);
  const server = join(directory, "server");
  mkdirSync(server);
  writeFileSync(join(server, "index.mjs"), source, "utf8");
  return directory;
}
