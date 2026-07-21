import { spawn } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const servicePort = readPort("SIDECHAT_LOCAL_SERVICE_PORT", 3000);
const widgetPort = readPort("SIDECHAT_LOCAL_WIDGET_PORT", 5175);
const serviceBaseUrl = `http://127.0.0.1:${servicePort}`;
const widgetUrl =
  `http://127.0.0.1:${widgetPort}/?authToken=local-test-token` +
  "&workspaceId=local-workspace&clientTools=false";

await runNpm(["run", "build:testing", "--workspace", "@side-chat/side-chat-service"]);

const service = spawnNode(["scripts/run-side-chat-service.mjs"], {
  PORT: String(servicePort),
  SIDECHAT_CONFIG: "fake",
});
await waitForHttp(`${serviceBaseUrl}/healthz`, service);

const widget = spawnNpm(
  [
    "--workspace",
    "@side-chat/widget-harness",
    "run",
    "dev",
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    String(widgetPort),
    "--strictPort",
  ],
  { SIDECHAT_WIDGET_HARNESS_API_TARGET: serviceBaseUrl },
);
await waitForHttp(widgetUrl, widget);

console.log(`Side Chat local fake is ready: ${widgetUrl}`);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  widget.kill("SIGTERM");
  service.kill("SIGTERM");
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const exitCode = await Promise.race([waitForExit(service), waitForExit(widget)]);
stop();
await Promise.allSettled([waitForExit(service), waitForExit(widget)]);
process.exitCode = exitCode;

function runNpm(args) {
  const child = spawnNpm(args, {});
  return waitForSuccess(child, `npm ${args.join(" ")}`);
}

function spawnNpm(args, extraEnv) {
  if (process.platform === "win32") {
    return spawnProcess("cmd.exe", ["/d", "/s", "/c", "npm", ...args], extraEnv);
  }
  return spawnProcess("npm", args, extraEnv);
}

function spawnNode(args, extraEnv) {
  return spawnProcess(process.execPath, args, extraEnv);
}

function spawnProcess(command, args, extraEnv) {
  return spawn(command, args, {
    cwd: repoRoot,
    env: cleanEnv({ ...process.env, ...extraEnv }),
    shell: false,
    stdio: "inherit",
  });
}

function cleanEnv(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key, value]) => key.length > 0 && !key.startsWith("=") && value !== undefined,
    ),
  );
}

function waitForSuccess(child, description) {
  return new Promise((resolveRun, rejectRun) => {
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${description} exited with ${code ?? "unknown"}`));
    });
  });
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode ?? 1);
  return new Promise((resolveExit) => {
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

async function waitForHttp(url, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Process exited before ${url} became ready`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The listener is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function readPort(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 && value <= 65_535 ? value : fallback;
}
