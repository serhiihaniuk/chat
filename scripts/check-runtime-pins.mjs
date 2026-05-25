import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { failIfErrors, readJson, resolveRoot } from "./lib/governance.mjs";

const root = resolveRoot();
const errors = [];
const packageJson = readJson(root, "package.json");
const expectedNode = packageJson.engines?.node;
const expectedNpm = packageJson.engines?.npm;
const nvmNode = readFileSync(`${root}/.nvmrc`, "utf8").trim();
const actualNode = process.version.replace(/^v/, "");
const npmCommand =
  process.platform === "win32"
    ? {
        command: process.env.ComSpec ?? "cmd.exe",
        args: ["/d", "/s", "/c", "npm -v"],
      }
    : { command: "npm", args: ["-v"] };
const actualNpm = execFileSync(npmCommand.command, npmCommand.args, {
  cwd: root,
  encoding: "utf8",
}).trim();

if (expectedNode !== nvmNode) {
  errors.push(`.nvmrc ${nvmNode} does not match engines.node ${expectedNode}`);
}
if (actualNode !== expectedNode) {
  errors.push(`node ${actualNode} does not match pinned ${expectedNode}`);
}
if (actualNpm !== expectedNpm) {
  errors.push(`npm ${actualNpm} does not match pinned ${expectedNpm}`);
}
if (packageJson.packageManager !== `npm@${expectedNpm}`) {
  errors.push(
    `packageManager ${packageJson.packageManager} does not match npm@${expectedNpm}`,
  );
}

failIfErrors(errors);
