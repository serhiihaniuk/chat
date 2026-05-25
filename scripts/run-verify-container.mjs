import { spawn } from "node:child_process";
import { resolve } from "node:path";

const imageTag = "side-chat-dev-test:local";
const repoRoot = resolve(import.meta.dirname, "..");

await run("docker", ["build", "-f", "infra/docker/dev-test.Dockerfile", "-t", imageTag, "."]);

await run("docker", [
  "run",
  "--rm",
  "--add-host",
  "host.docker.internal:host-gateway",
  "-e",
  "TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal",
  "-v",
  "/var/run/docker.sock:/var/run/docker.sock",
  imageTag,
  "sh",
  "-lc",
  "npm run verify && npm run test:db:container && npm run test:e2e:persistent",
]);

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? "unknown"}`));
    });
  });
}
