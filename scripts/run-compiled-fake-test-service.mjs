import { spawn } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

await runNpm(["run", "build:testing", "--workspace", "@side-chat/side-chat-service"]);
process.env.SIDECHAT_CONFIG = "fake";
await import("./run-side-chat-service.mjs");

function runNpm(args) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      env: cleanEnv(process.env),
      shell: false,
      stdio: "inherit",
    });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`npm ${args.join(" ")} exited with ${code ?? "unknown"}`));
    });
  });
}

function cleanEnv(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key, value]) => key.length > 0 && !key.startsWith("=") && value !== undefined,
    ),
  );
}
