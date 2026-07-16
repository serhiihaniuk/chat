import { rmSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertProductionBundleExcludesTestingCode,
  assertProductionBundleUsesPostgresWorld,
} from "./production-bundle-guard.js";
import { runCompiledCommand } from "./compiled-service/command.js";
import {
  crashCompiledProcess,
  requestCompiledShutdown,
  stopCompiledProcess,
  type CompiledShutdownResult,
} from "./compiled-service/process-control.js";
import {
  launchCompiledProcess,
  observeStartupFailure,
  waitForCompiledReady,
} from "./compiled-service/runtime.js";

const repoRoot = resolve(import.meta.dirname, "../../../../../..");
const serviceRoot = resolve(repoRoot, "apps/side-chat-service");
const SUPERVISED_START_MAX_ATTEMPTS = 3;

export type CompiledService = Readonly<{
  baseUrl: string;
  output: () => string;
  shutdown: (requestCount?: number) => Promise<CompiledShutdownResult>;
  crash: () => Promise<void>;
  close: () => Promise<void>;
}>;

export type { CompiledShutdownResult } from "./compiled-service/process-control.js";

export type CompiledStartupFailure = Readonly<{
  exitCode: number | null;
  openedPort: boolean;
  output: string;
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
  await runCompiledCommand(
    options,
    "npm",
    ["run", "build:testing", "--workspace", "@side-chat/side-chat-service"],
    repoRoot,
  );
  return {
    start: () => startPreparedService(options),
    close: async () => {
      await restoreProductionBuild(options);
    },
  };
}

export async function startPreparedService(
  options: CompiledServiceOptions,
): Promise<CompiledService> {
  for (let attempt = 1; attempt <= SUPERVISED_START_MAX_ATTEMPTS; attempt += 1) {
    const process = await launchCompiledProcess(options, repoRoot, serviceRoot);
    try {
      await waitForCompiledReady(process);
      return compiledService(process);
    } catch (error) {
      const exitedBeforeReady = process.child.exitCode !== null;
      await stopCompiledProcess(process.child);
      rmSync(process.workflowDataDir, { recursive: true, force: true });
      if (!exitedBeforeReady || attempt === SUPERVISED_START_MAX_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw new Error("Compiled service exhausted its supervised start attempts");
}

function compiledService(
  process: Awaited<ReturnType<typeof launchCompiledProcess>>,
): CompiledService {
  return {
    baseUrl: process.baseUrl,
    output: process.output,
    shutdown: (requestCount = 1) => requestCompiledShutdown(process.child, requestCount),
    crash: () => crashCompiledProcess(process.child),
    close: async () => {
      await stopCompiledProcess(process.child);
      rmSync(process.workflowDataDir, { recursive: true, force: true });
    },
  };
}

/** Proves failed boot never exposes the reserved port and still terminates. */
export async function observeCompiledStartupFailure(
  options: CompiledServiceOptions,
): Promise<CompiledStartupFailure> {
  return observeStartupFailure(options, repoRoot, serviceRoot);
}

async function restoreProductionBuild(options: CompiledServiceOptions): Promise<void> {
  await runCompiledCommand(
    options,
    "npm",
    ["run", "build", "--workspace", "@side-chat/side-chat-service"],
    repoRoot,
  );
  assertProductionBundleExcludesTestingCode(
    resolve(serviceRoot, ".output"),
    options.providerObservationPrefix,
  );
  assertProductionBundleUsesPostgresWorld(resolve(serviceRoot, ".output"));
}
