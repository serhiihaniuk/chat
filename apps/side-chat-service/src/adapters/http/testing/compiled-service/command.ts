import { spawn } from "node:child_process";

import type { CompiledServiceOptions } from "../compiled-service-process.js";

export async function runCompiledCommand(
  options: CompiledServiceOptions,
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
): Promise<void> {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(resolveCommand(command), resolveArgs(command, args), {
      cwd,
      env: cleanCompiledEnvironment(
        options.environment,
        options.targetWorldEnvKey,
        options.useConfiguredTargetWorld ?? false,
      ),
      shell: false,
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} exited with ${code ?? "unknown"}`));
    });
  });
}

export function cleanCompiledEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  targetWorldEnvKey: string,
  preserveTargetWorld: boolean,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key, value]) =>
        key.length > 0 &&
        !key.startsWith("=") &&
        (preserveTargetWorld || key !== targetWorldEnvKey) &&
        value !== undefined,
    ),
  );
}

function resolveCommand(command: string): string {
  return process.platform === "win32" && command === "npm" ? "cmd.exe" : command;
}

function resolveArgs(command: string, args: ReadonlyArray<string>): ReadonlyArray<string> {
  return process.platform === "win32" && command === "npm"
    ? ["/d", "/s", "/c", "npm", ...args]
    : args;
}
