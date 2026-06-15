import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  failIfErrors,
  packageManagerVersion,
  readJson,
  resolveRoot,
  versionSatisfiesRange,
} from "./lib/governance.mjs";

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

if (!versionSatisfiesRange(nvmNode, expectedNode)) {
  errors.push(`.nvmrc ${nvmNode} is outside supported Node range ${expectedNode}`);
}
if (!versionSatisfiesRange(actualNode, expectedNode)) {
  errors.push(`node ${actualNode} is outside supported range ${expectedNode}`);
}
if (!versionSatisfiesRange(actualNpm, expectedNpm)) {
  errors.push(`npm ${actualNpm} is outside supported range ${expectedNpm}`);
}

const packageManagerNpm = packageManagerVersion(packageJson.packageManager, "npm");
if (!packageManagerNpm) {
  errors.push(`packageManager ${packageJson.packageManager} must use npm`);
} else if (!versionSatisfiesRange(packageManagerNpm, expectedNpm)) {
  errors.push(`packageManager npm ${packageManagerNpm} is outside supported range ${expectedNpm}`);
}

failIfErrors(errors);
