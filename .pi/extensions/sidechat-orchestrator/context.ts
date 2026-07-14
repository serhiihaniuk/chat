import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { normalizeRepositoryPath, scopesForPaths, uniqueStrings } from "./routing.ts";
import type { SidechatPiAPI, ToolResult } from "./types.ts";

const PLAN_STATUS_PATH = "plan/v7/STATUS.md";
const MAX_DIRTY_FILES = 80;
const MAX_PLAN_ROWS = 12;

export type ContextMode = "impact" | "locate" | "plan-state" | "trace";

export type TaskContextParams = {
  readonly objective: string;
  readonly mode?: ContextMode;
  readonly hints?: readonly string[];
};

export type TaskContextDetails = {
  readonly objective: string;
  readonly mode: ContextMode;
  readonly dirtyFiles: readonly string[];
  readonly truncatedDirtyFiles: boolean;
  readonly scopes: readonly string[];
  readonly dirtyScopes: readonly string[];
  readonly canonicalDocs: readonly string[];
  readonly workspaceChecks: readonly string[];
  readonly activePlanRows: readonly string[];
  readonly warnings: readonly string[];
  readonly recommendedAgent: "context-builder" | "parent";
};

function parseDirtyFiles(status: string): readonly string[] {
  return status
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.slice(3))
    .map((path) => path.split(" -> ").at(-1) ?? path)
    .map(normalizeRepositoryPath);
}

function selectPlanRows(
  markdown: string,
  objective: string,
  hints: readonly string[],
): readonly string[] {
  const searchTerms = [...objective.split(/\W+/u), ...hints]
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 4);
  const rows = markdown
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("|") && !line.includes("---"));
  const activeRows = rows.filter((line) =>
    /in[_ -]?progress|blocked|not[_ -]?started|pending/iu.test(line),
  );
  const relevantRows = rows.filter((line) =>
    searchTerms.some((term) => line.toLowerCase().includes(term)),
  );
  return uniqueStrings([...relevantRows, ...activeRows]).slice(0, MAX_PLAN_ROWS);
}

async function readPlanRows(
  cwd: string,
  objective: string,
  hints: readonly string[],
): Promise<readonly string[]> {
  try {
    const markdown = await readFile(join(cwd, PLAN_STATUS_PATH), "utf8");
    return selectPlanRows(markdown, objective, hints);
  } catch {
    return [];
  }
}

export async function buildTaskContext(
  pi: SidechatPiAPI,
  cwd: string,
  params: TaskContextParams,
  signal: AbortSignal,
): Promise<ToolResult<TaskContextDetails>> {
  const mode = params.mode ?? "impact";
  const hints = params.hints ?? [];
  const status = await pi.exec(
    "git",
    ["-c", "core.quotepath=false", "status", "--porcelain=v1", "--untracked-files=all"],
    { cwd, signal, timeout: 15_000 },
  );
  if (status.code !== 0) {
    return {
      content: [
        {
          type: "text",
          text: `Unable to inspect repository state: ${status.stderr.trim() || "git status failed"}`,
        },
      ],
      details: {
        objective: params.objective,
        mode,
        dirtyFiles: [],
        truncatedDirtyFiles: false,
        scopes: [],
        dirtyScopes: [],
        canonicalDocs: [],
        workspaceChecks: [],
        activePlanRows: [],
        warnings: ["Repository status is unavailable."],
        recommendedAgent: "parent",
      },
      isError: true,
    };
  }

  const allDirtyFiles = parseDirtyFiles(status.stdout);
  const hintedPaths = hints.map(normalizeRepositoryPath);
  const dirtyScopes = scopesForPaths(allDirtyFiles);
  const hintedScopes = scopesForPaths(hintedPaths);
  const scopes = hintedScopes.length > 0 ? hintedScopes : dirtyScopes;
  const activePlanRows = await readPlanRows(cwd, params.objective, hints);
  const warnings: string[] = [];
  if (allDirtyFiles.length > 0)
    warnings.push("Preserve pre-existing dirty files; assign an explicit write scope.");
  if (scopes.length > 1)
    warnings.push(
      "The candidate surface crosses ownership scopes; split independent implementation slices.",
    );
  if (scopes.some((scope) => scope.browserEvidence))
    warnings.push("Visible behavior requires browser-evidence after deterministic checks pass.");
  if (scopes.length === 0)
    warnings.push("No known ownership scope matched; use context-builder before delegating edits.");

  const details: TaskContextDetails = {
    objective: params.objective,
    mode,
    dirtyFiles: allDirtyFiles.slice(0, MAX_DIRTY_FILES),
    truncatedDirtyFiles: allDirtyFiles.length > MAX_DIRTY_FILES,
    scopes: scopes.map((scope) => scope.id),
    dirtyScopes: dirtyScopes.map((scope) => scope.id),
    canonicalDocs: uniqueStrings(scopes.flatMap((scope) => scope.canonicalDocs)),
    workspaceChecks: scopes.flatMap((scope) =>
      scope.workspace ? [`npm.cmd --workspace ${scope.workspace} run typecheck`] : [],
    ),
    activePlanRows,
    warnings,
    recommendedAgent: mode === "plan-state" && scopes.length > 0 ? "parent" : "context-builder",
  };

  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}
