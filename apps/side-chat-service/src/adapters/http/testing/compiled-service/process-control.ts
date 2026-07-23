import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

export type CompiledShutdownResult = Readonly<{
  exitCode: number | null;
  observations: readonly unknown[];
}>;

export async function stopCompiledProcess(child: ChildProcess): Promise<void> {
  if (hasCompiledProcessExited(child)) return;
  await requestCompiledShutdown(child, 1).catch(() => undefined);
  if (hasCompiledProcessExited(child)) return;
  await crashCompiledProcess(child);
}

export async function requestCompiledShutdown(
  child: ChildProcess,
  requestCount: number,
): Promise<CompiledShutdownResult> {
  if (hasCompiledProcessExited(child)) return { exitCode: child.exitCode, observations: [] };
  requirePositiveInteger(requestCount, "requestCount");
  let observations: readonly unknown[] = [];
  const onMessage = (message: unknown): void => {
    if (isShutdownCompletion(message)) observations = message.observations;
  };
  child.on("message", onMessage);
  for (let index = 0; index < requestCount; index += 1) {
    child.send({ type: "sidechat.shutdown" });
  }
  try {
    await once(child, "exit", { signal: AbortSignal.timeout(30_000) });
    return { exitCode: child.exitCode, observations };
  } finally {
    child.off("message", onMessage);
  }
}

export async function crashCompiledProcess(child: ChildProcess): Promise<void> {
  if (hasCompiledProcessExited(child)) return;
  const exited = once(child, "exit", { signal: AbortSignal.timeout(5_000) });
  try {
    if (process.platform === "win32" && child.pid !== undefined) {
      await killWindowsProcessTree(child.pid);
    } else {
      child.kill("SIGKILL");
    }
    if (hasCompiledProcessExited(child)) return;
    await exited;
  } catch {
    if (hasCompiledProcessExited(child)) return;
    throw new Error("Compiled service did not exit after SIGKILL");
  }
}

export function hasCompiledProcessExited(
  child: Pick<ChildProcess, "exitCode" | "signalCode">,
): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function killWindowsProcessTree(pid: number): Promise<void> {
  await new Promise<void>((resolveKill) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    killer.once("error", () => resolveKill());
    killer.once("exit", () => resolveKill());
  });
}

function isShutdownCompletion(
  message: unknown,
): message is Readonly<{ type: "sidechat.shutdown.complete"; observations: readonly unknown[] }> {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "sidechat.shutdown.complete" &&
    "observations" in message &&
    Array.isArray(message.observations)
  );
}

function requirePositiveInteger(value: number, name: string): void {
  if (Number.isSafeInteger(value) && value > 0) return;
  throw new TypeError(`${name} must be a positive integer`);
}
