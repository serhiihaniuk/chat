import {
  failIfErrors,
  listWorkspacePackageJsons,
  readJson,
  resolveRoot,
} from "./lib/governance.mjs";

const root = resolveRoot();
const errors = [];
const rootTsconfig = readJson(root, "tsconfig.json");
const references = new Set(
  (rootTsconfig.references ?? []).map((reference) => reference.path.replace(/^\.\//, "")),
);

for (const packageJsonPath of listWorkspacePackageJsons(root)) {
  const packageJson = readJson(root, packageJsonPath);
  const workspacePath = packageJsonPath.replace("/package.json", "");

  if (!packageJson.name?.startsWith("@side-chat/"))
    errors.push(`${packageJsonPath}: package name must be @side-chat scoped`);
  if (packageJson.version !== "0.0.0") errors.push(`${packageJsonPath}: version must be 0.0.0`);
  if (packageJson.private !== true)
    errors.push(`${packageJsonPath}: private must be true before publishing ADRs`);
  if (packageJson.type !== "module") errors.push(`${packageJsonPath}: type must be module`);
  if (!packageJson.exports?.["."])
    errors.push(`${packageJsonPath}: public entrypoint export is required`);
  if (!packageJson.types) errors.push(`${packageJsonPath}: types path is required`);
  if (!packageJson.scripts?.typecheck)
    errors.push(`${packageJsonPath}: typecheck script is required`);
  if (!references.has(workspacePath))
    errors.push(`tsconfig.json is missing reference to ${workspacePath}`);
}

failIfErrors(errors);
