import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRepositoryPath, scopesForPaths, uniqueStrings } from "./routing.ts";
import type { ExecResult, SidechatPiAPI, ToolResult } from "./types.ts";

const RUNTIME_LOG_DIRECTORY = ".pi/runtime/verification";
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_FAILURE_LINES = 36;
const MAX_SCOPED_FILES = 100;
const FORMAT_EXTENSIONS = new Set([".css", ".js", ".json", ".jsx", ".md", ".mjs", ".ts", ".tsx"]);
const LINT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const WINDOWS_COMMAND_RUNNER = join(dirname(fileURLToPath(import.meta.url)), "run-command.ps1");

export type VerificationTier = "focused" | "full" | "standard";

export type VerificationParams = {
  readonly paths: readonly string[];
  readonly tier?: VerificationTier;
  readonly claim?: string;
  readonly tests?: readonly string[];
};

type VerificationCommand = {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
};

type VerificationCommandResult = VerificationCommand & {
  readonly code: number;
  readonly killed: boolean;
};

export type VerificationDetails = {
  readonly passed: boolean;
  readonly tier: VerificationTier;
  readonly claim?: string;
  readonly scopedFiles: readonly string[];
  readonly scopes: readonly string[];
  readonly commands: readonly VerificationCommandResult[];
  readonly logPath?: string;
};

function assertRepositoryPath(cwd: string, path: string): string {
  if (path.trim().length === 0 || isAbsolute(path))
    throw new Error(`Expected a non-empty repository-relative path: ${path}`);
  const absolutePath = resolve(cwd, path);
  const relativePath = normalizeRepositoryPath(relative(cwd, absolutePath));
  if (relativePath === ".." || relativePath.startsWith("../"))
    throw new Error(`Path leaves the repository: ${path}`);
  return relativePath;
}

async function pathExists(cwd: string, path: string): Promise<boolean> {
  try {
    await access(join(cwd, path));
    return true;
  } catch {
    return false;
  }
}

async function collectScopedFiles(
  pi: SidechatPiAPI,
  cwd: string,
  paths: readonly string[],
  signal: AbortSignal,
): Promise<readonly string[]> {
  const files: string[] = [];
  for (const path of paths) {
    const absolutePath = join(cwd, path);
    if (await pathExists(cwd, path)) {
      const pathStat = await stat(absolutePath);
      if (pathStat.isFile()) files.push(path);
    }
    const status = await pi.exec(
      "git",
      [
        "-c",
        "core.quotepath=false",
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        path,
      ],
      { cwd, signal, timeout: 15_000 },
    );
    if (status.code !== 0) {
      throw new Error(`Unable to inspect assigned path '${path}': ${status.stderr.trim()}`);
    }
    files.push(
      ...status.stdout
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => line.slice(3))
        .map((file) => file.split(" -> ").at(-1) ?? file)
        .map(normalizeRepositoryPath),
    );
  }
  const scopedFiles = uniqueStrings(files);
  if (scopedFiles.length > MAX_SCOPED_FILES) {
    throw new Error(
      `Assigned paths contain ${scopedFiles.length} changed files; narrow the verification scope below ${MAX_SCOPED_FILES}.`,
    );
  }
  return scopedFiles;
}

async function discoverTests(
  cwd: string,
  files: readonly string[],
  explicitTests: readonly string[],
): Promise<readonly string[]> {
  const candidates = [...explicitTests];
  for (const file of files) {
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file)) {
      candidates.push(file);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/u.test(file)) continue;
    const suffix = extname(file);
    const base = file.slice(0, -suffix.length);
    candidates.push(`${base}.test${suffix}`, `${base}.spec${suffix}`);
  }
  const existing: string[] = [];
  for (const candidate of uniqueStrings(candidates)) {
    if (await pathExists(cwd, candidate)) existing.push(candidate);
  }
  return existing;
}

function buildCommands(
  tier: VerificationTier,
  files: readonly string[],
  existingFiles: readonly string[],
  tests: readonly string[],
): readonly VerificationCommand[] {
  if (tier === "full") {
    return [
      {
        label: "full repository verification",
        command: "npx.cmd",
        args: ["-p", "node@24.16.0", "-p", "npm@11.15.0", "npm", "run", "verify"],
      },
    ];
  }

  const commands: VerificationCommand[] = [];
  if (tests.length > 0)
    commands.push({ label: "focused tests", command: "npm.cmd", args: ["test", "--", ...tests] });

  const scopes = scopesForPaths(files);
  for (const workspace of uniqueStrings(
    scopes.flatMap((scope) => (scope.workspace ? [scope.workspace] : [])),
  )) {
    commands.push({
      label: `${workspace} typecheck`,
      command: "npm.cmd",
      args: ["--workspace", workspace, "run", "typecheck"],
    });
  }

  const formatFiles = existingFiles.filter((file) =>
    FORMAT_EXTENSIONS.has(extname(file).toLowerCase()),
  );
  if (formatFiles.length > 0) {
    commands.push({
      label: "scoped format check",
      command: "npx.cmd",
      args: ["--no-install", "oxfmt", "--check", ...formatFiles],
    });
  }

  if (tier === "standard") {
    const lintFiles = existingFiles.filter((file) =>
      LINT_EXTENSIONS.has(extname(file).toLowerCase()),
    );
    if (lintFiles.length > 0) {
      commands.push({
        label: "scoped oxlint",
        command: "npx.cmd",
        args: ["--no-install", "oxlint", "--deny-warnings", ...lintFiles],
      });
    }
    commands.push({
      label: "custom repository gates",
      command: "npm.cmd",
      args: ["run", "lint:custom"],
    });
  }
  return commands;
}

function quoteArgument(argument: string): string {
  return /\s/u.test(argument) ? JSON.stringify(argument) : argument;
}

function commandText(command: VerificationCommand): string {
  return [command.command, ...command.args.map(quoteArgument)].join(" ");
}

function executeCommand(
  pi: SidechatPiAPI,
  cwd: string,
  command: VerificationCommand,
  signal: AbortSignal,
): Promise<ExecResult> {
  if (process.platform !== "win32") {
    return pi.exec(command.command, command.args, { cwd, signal, timeout: COMMAND_TIMEOUT_MS });
  }
  return pi.exec(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      WINDOWS_COMMAND_RUNNER,
      command.command,
      ...command.args,
    ],
    { cwd, signal, timeout: COMMAND_TIMEOUT_MS },
  );
}

function failureExcerpt(result: ExecResult): string {
  const lines = `${result.stdout}\n${result.stderr}`.split(/\r?\n/u).filter(Boolean);
  const relevant = lines.filter((line) => /error|fail|warning/iu.test(line));
  return uniqueStrings([...relevant.slice(-24), ...lines.slice(-12)])
    .slice(-MAX_FAILURE_LINES)
    .join("\n");
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

export async function runVerification(
  pi: SidechatPiAPI,
  cwd: string,
  params: VerificationParams,
  signal: AbortSignal,
): Promise<ToolResult<VerificationDetails>> {
  const tier = params.tier ?? "focused";
  const paths = uniqueStrings(params.paths.map((path) => assertRepositoryPath(cwd, path)));
  const explicitTests = uniqueStrings(
    (params.tests ?? []).map((path) => assertRepositoryPath(cwd, path)),
  );
  if (paths.length === 0) throw new Error("Verification requires at least one assigned path.");
  for (const test of explicitTests) {
    if (!(await pathExists(cwd, test))) throw new Error(`Explicit test does not exist: ${test}`);
  }

  const files = await collectScopedFiles(pi, cwd, paths, signal);
  const existingFiles: string[] = [];
  for (const file of files) {
    if (await pathExists(cwd, file)) existingFiles.push(file);
  }
  const tests = await discoverTests(cwd, files, explicitTests);
  const commands = buildCommands(tier, files, existingFiles, tests);
  if (commands.length === 0) {
    const details: VerificationDetails = {
      passed: true,
      tier,
      claim: params.claim,
      scopedFiles: files,
      scopes: scopesForPaths(files).map((scope) => scope.id),
      commands: [],
    };
    return {
      content: [{ type: "text", text: "No deterministic checks matched the assigned paths." }],
      details,
    };
  }

  const logDirectory = join(cwd, RUNTIME_LOG_DIRECTORY);
  const logPath = join(logDirectory, `${timestamp()}-${tier}.log`);
  await mkdir(logDirectory, { recursive: true });
  const logs: string[] = [];
  const results: VerificationCommandResult[] = [];

  for (const command of commands) {
    const header = `$ ${commandText(command)}`;
    const result = await executeCommand(pi, cwd, command, signal);
    logs.push(header, result.stdout, result.stderr);
    results.push({ ...command, code: result.code, killed: result.killed ?? false });
    if (result.code !== 0) {
      await writeFile(logPath, logs.join("\n"), "utf8");
      const relativeLogPath = normalizeRepositoryPath(relative(cwd, logPath));
      const excerpt = failureExcerpt(result);
      const details: VerificationDetails = {
        passed: false,
        tier,
        claim: params.claim,
        scopedFiles: files,
        scopes: scopesForPaths(files).map((scope) => scope.id),
        commands: results,
        logPath: relativeLogPath,
      };
      return {
        content: [
          {
            type: "text",
            text: `${command.label} failed (${result.code}).\n${excerpt}\nFull log: ${relativeLogPath}`,
          },
        ],
        details,
        isError: true,
      };
    }
  }

  await writeFile(logPath, logs.join("\n"), "utf8");
  const relativeLogPath = normalizeRepositoryPath(relative(cwd, logPath));
  const details: VerificationDetails = {
    passed: true,
    tier,
    claim: params.claim,
    scopedFiles: files,
    scopes: scopesForPaths(files).map((scope) => scope.id),
    commands: results,
    logPath: relativeLogPath,
  };
  const summary = results.map((result) => `[pass] ${result.label}`).join("\n");
  return { content: [{ type: "text", text: `${summary}\nLog: ${relativeLogPath}` }], details };
}
