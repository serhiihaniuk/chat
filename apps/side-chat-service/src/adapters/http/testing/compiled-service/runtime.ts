import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { availableLocalPort, localPortAcceptsConnections } from "../local-port.js";
import type {
  CompiledServiceOptions,
  CompiledStartupFailure,
} from "../compiled-service-process.js";
import { cleanCompiledEnvironment } from "./command.js";
import { stopCompiledProcess } from "./process-control.js";

export type StartedCompiledProcess = Readonly<{
  baseUrl: string;
  child: ChildProcess;
  output: () => string;
  workflowDataDir: string;
}>;

export async function launchCompiledProcess(
  options: CompiledServiceOptions,
  repoRoot: string,
  serviceRoot: string,
): Promise<StartedCompiledProcess> {
  const port = await availableLocalPort();
  const workflowDataDir = mkdtempSync(join(tmpdir(), "side-chat-workflow-data-"));
  let serviceOutput = "";
  const child = startProcess(options, repoRoot, serviceRoot, port, workflowDataDir, (chunk) => {
    serviceOutput += chunk;
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    child,
    output: () => serviceOutput,
    workflowDataDir,
  };
}

export async function waitForCompiledReady(process: StartedCompiledProcess): Promise<void> {
  const port = Number(new URL(process.baseUrl).port);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (process.child.exitCode !== null) throw new Error(`Service exited:\n${process.output()}`);
    if (await localPortAcceptsConnections(port).catch(() => false)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for service:\n${process.output()}`);
}

export async function observeStartupFailure(
  options: CompiledServiceOptions,
  repoRoot: string,
  serviceRoot: string,
): Promise<CompiledStartupFailure> {
  const process = await launchCompiledProcess(options, repoRoot, serviceRoot);
  const port = Number(new URL(process.baseUrl).port);
  let openedPort = false;
  try {
    const deadline = Date.now() + 30_000;
    while (process.child.exitCode === null && Date.now() < deadline) {
      openedPort ||= await localPortAcceptsConnections(port).catch(() => false);
      await delay(50);
    }
    if (process.child.exitCode === null) throw new Error("Failed service boot did not terminate");
    return { exitCode: process.child.exitCode, openedPort, output: process.output() };
  } finally {
    await stopCompiledProcess(process.child);
    rmSync(process.workflowDataDir, { recursive: true, force: true });
  }
}

function startProcess(
  options: CompiledServiceOptions,
  repoRoot: string,
  serviceRoot: string,
  port: number,
  workflowDataDir: string,
  captureOutput: (chunk: string) => void,
): ChildProcess {
  const child = spawn(process.execPath, [resolve(repoRoot, "scripts/run-side-chat-service.mjs")], {
    cwd: serviceRoot,
    env: cleanCompiledEnvironment(
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
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.stdout?.on("data", (chunk) => captureOutput(String(chunk)));
  child.stderr?.on("data", (chunk) => captureOutput(String(chunk)));
  return child;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
