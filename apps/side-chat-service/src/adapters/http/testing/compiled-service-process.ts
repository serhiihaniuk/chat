import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { assertProductionBundleExcludesTestingCode } from "./production-bundle-guard.js";
import {
  availableLocalPort,
  localPortAcceptsConnections,
} from "./local-port.js";

const repoRoot = resolve(import.meta.dirname, "../../../../../..");
const serviceRoot = resolve(repoRoot, "apps/side-chat-service");

export type CompiledService = Readonly<{
  baseUrl: string;
  output: () => string;
  close: () => Promise<void>;
}>;

export type CompiledServiceOptions = Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  configName: string;
  configNameEnvKey: string;
  localBaseUrlEnvKey: string;
  localDataDirectoryEnvKey: string;
  providerObservationPrefix: string;
  targetWorldEnvKey: string;
  useConfiguredTargetWorld?: boolean;
}>;

export type PreparedCompiledService = Readonly<{
  start: () => Promise<CompiledService>;
  close: () => Promise<void>;
}>;

export async function startCompiledService(
  options: CompiledServiceOptions,
): Promise<CompiledService> {
  const prepared = await prepareCompiledService(options);
  const service = await prepared.start();
  return {
    ...service,
    close: async () => {
      await service.close();
      await prepared.close();
    },
  };
}

/** Builds once so a test can prove durable state survives a process boundary. */
export async function prepareCompiledService(
  options: CompiledServiceOptions,
): Promise<PreparedCompiledService> {
  await runCommand(options, "npm", [
    "run",
    "build:testing",
    "--workspace",
    "@side-chat/side-chat-service",
  ]);
  return {
    start: () => startPreparedService(options),
    close: async () => {
      await restoreProductionBuild(options);
    },
  };
}

async function startPreparedService(
  options: CompiledServiceOptions,
): Promise<CompiledService> {
  const port = await availableLocalPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const workflowDataDir = mkdtempSync(
    join(tmpdir(), "side-chat-workflow-data-"),
  );
  let serviceOutput = "";
  const service = startService(options, port, workflowDataDir, (chunk) => {
    serviceOutput += chunk;
  });
  await waitForReady(service, port, () => serviceOutput);
  return {
    baseUrl,
    output: () => serviceOutput,
    close: async () => {
      await stopService(service);
      rmSync(workflowDataDir, { recursive: true, force: true });
    },
  };
}

function startService(
  options: CompiledServiceOptions,
  port: number,
  workflowDataDir: string,
  captureOutput: (chunk: string) => void,
): ChildProcess {
  const child = spawn(process.execPath, [".output/server/index.mjs"], {
    cwd: serviceRoot,
    env: cleanEnv(
      {
        ...options.environment,
        PORT: String(port),
        [options.configNameEnvKey]: options.configName,
        [options.localDataDirectoryEnvKey]: workflowDataDir,
        [options.localBaseUrlEnvKey]: `http://127.0.0.1:${port}`,
      },
      options.targetWorldEnvKey,
      options.useConfiguredTargetWorld ?? false,
    ),
    shell: false,
    stdio: "pipe",
  });
  child.stdout?.on("data", (chunk) => captureOutput(String(chunk)));
  child.stderr?.on("data", (chunk) => captureOutput(String(chunk)));
  return child;
}

async function waitForReady(
  service: ChildProcess,
  port: number,
  output: () => string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (service.exitCode !== null) {
      throw new Error(`Service exited:\n${output()}`);
    }
    try {
      if (await localPortAcceptsConnections(port)) return;
    } catch {
      // The child process may not have bound its port yet.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for service:\n${output()}`);
}

async function stopService(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  try {
    await once(child, "exit", { signal: AbortSignal.timeout(5_000) });
    return;
  } catch {
    if (child.exitCode !== null) return;
  }

  child.kill("SIGKILL");
  try {
    await once(child, "exit", { signal: AbortSignal.timeout(5_000) });
  } catch {
    if (child.exitCode !== null) return;
    throw new Error("Compiled service did not exit after SIGKILL");
  }
}

async function restoreProductionBuild(
  options: CompiledServiceOptions,
): Promise<void> {
  await runCommand(options, "npm", [
    "run",
    "build",
    "--workspace",
    "@side-chat/side-chat-service",
  ]);
  assertProductionBundleExcludesTestingCode(
    resolve(serviceRoot, ".output"),
    options.providerObservationPrefix,
  );
}

async function runCommand(
  options: CompiledServiceOptions,
  command: string,
  args: ReadonlyArray<string>,
): Promise<void> {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(resolveCommand(command), resolveArgs(command, args), {
      cwd: repoRoot,
      env: cleanEnv(
        options.environment,
        options.targetWorldEnvKey,
        options.useConfiguredTargetWorld ?? false,
      ),
      shell: false,
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${command} exited with ${code ?? "unknown"}`));
    });
  });
}

function resolveCommand(command: string): string {
  return process.platform === "win32" && command === "npm"
    ? "cmd.exe"
    : command;
}

function resolveArgs(
  command: string,
  args: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return process.platform === "win32" && command === "npm"
    ? ["/d", "/s", "/c", "npm", ...args]
    : args;
}

/** Keeps spawned builds isolated from malformed shell entries and postgres targets. */
function cleanEnv(
  env: Readonly<Record<string, string | undefined>>,
  targetWorldEnvKey: string,
  preserveTargetWorld: boolean,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) =>
        key.length > 0 &&
        !key.startsWith("=") &&
        (preserveTargetWorld || key !== targetWorldEnvKey) &&
        value !== undefined,
    ),
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
