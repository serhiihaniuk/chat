import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  crashCompiledProcess,
  hasCompiledProcessExited,
  stopCompiledProcess,
} from "./process-control.js";

describe("compiled service process control", () => {
  it("treats a signal-terminated process as exited when cleanup runs again", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => undefined, 1_000)"], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });

    await crashCompiledProcess(child);

    expect(hasCompiledProcessExited(child)).toBe(true);
    await expect(stopCompiledProcess(child)).resolves.toBeUndefined();
  });
});
