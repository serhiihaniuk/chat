import {
  collectDependencies,
  failIfErrors,
  isExactVersion,
  isFile,
  listWorkspacePackageJsons,
  packageManagerVersion,
  readJson,
  resolveRoot,
  versionSatisfiesRange,
} from "./lib/governance.mjs";
import { readFileSync } from "node:fs";

const root = resolveRoot();
const errors = [];

const rootPackage = readJson(root, "package.json");
const supportedNodeRange = ">=24.15.0 <25.0.0";
const supportedNpmRange = ">=11.12.0 <12.0.0";
const preferredNpmVersion = "11.15.0";

const requiredRoot = {
  typescript: "6.0.3",
  "@types/node": "24.12.4",
  tsx: "4.22.3",
  vitest: "4.1.7",
  "@effect/vitest": "4.0.0-beta.70",
  playwright: "1.60.0",
  oxlint: "1.66.0",
  "oxlint-tsgolint": "0.23.0",
  oxfmt: "0.51.0",
  vite: "8.0.14",
  "@vitejs/plugin-react": "6.0.2",
  tailwindcss: "4.3.0",
  testcontainers: "12.0.0",
  "@types/react": "19.2.15",
  "@types/react-dom": "19.2.3",
  "happy-dom": "20.9.0",
};

const requiredByPackage = {
  "@side-chat/partner-ai-service": {
    hono: "4.12.22",
    "@hono/node-server": "2.0.3",
    effect: "4.0.0-beta.70",
    "@effect/platform-node": "4.0.0-beta.70",
  },
  "@side-chat/agent-runtime": {
    ai: "6.0.191",
    "@ai-sdk/provider": "3.0.10",
    effect: "4.0.0-beta.70",
    zod: "4.4.3",
  },
  "@side-chat/partner-ai-core": {
    effect: "4.0.0-beta.70",
  },
  "@side-chat/db": {
    pg: "8.21.0",
    "@types/pg": "8.20.0",
    "drizzle-orm": "0.45.2",
    "drizzle-kit": "0.31.10",
  },
  "@side-chat/side-chat-widget": {
    react: "19.2.6",
    "react-dom": "19.2.6",
    "@base-ui/react": "1.5.0",
    "@streamdown/cjk": "1.0.3",
    "@streamdown/code": "1.1.1",
    "@streamdown/math": "1.0.2",
    "@streamdown/mermaid": "1.0.2",
    ai: "6.0.191",
    clsx: "2.1.1",
    "embla-carousel-react": "8.6.0",
    "lucide-react": "1.16.0",
    motion: "12.40.0",
    nanoid: "5.1.11",
    shiki: "4.1.0",
    streamdown: "2.5.0",
    "tailwind-merge": "3.6.0",
    "use-stick-to-bottom": "1.1.4",
  },
  "@side-chat/widget-harness": {
    react: "19.2.6",
    "react-dom": "19.2.6",
    vite: "8.0.14",
    "@vitejs/plugin-react": "6.0.2",
    tailwindcss: "4.3.0",
    "@tailwindcss/vite": "4.3.0",
  },
};

if (rootPackage.engines?.node !== supportedNodeRange)
  errors.push(`root engines.node must be ${supportedNodeRange}`);
if (rootPackage.engines?.npm !== supportedNpmRange)
  errors.push(`root engines.npm must be ${supportedNpmRange}`);

const rootPackageManagerNpm = packageManagerVersion(rootPackage.packageManager, "npm");
if (rootPackageManagerNpm !== preferredNpmVersion)
  errors.push(`root packageManager must be npm@${preferredNpmVersion}`);
if (!isFile(root, ".nvmrc")) errors.push(".nvmrc is required");
if (
  isFile(root, ".nvmrc") &&
  readJson(root, "package.json") &&
  !versionSatisfiesRange(readFileSync(`${root}/.nvmrc`, "utf8").trim(), supportedNodeRange)
) {
  errors.push(`.nvmrc must satisfy ${supportedNodeRange}`);
}
if (!isFile(root, "package-lock.json")) errors.push("package-lock.json is required");

for (const [name, version] of Object.entries(requiredRoot)) {
  if (rootPackage.devDependencies?.[name] !== version) {
    errors.push(`root devDependency ${name} must be exactly ${version}`);
  }
}

const packageJsonPaths = ["package.json", ...listWorkspacePackageJsons(root)];
for (const path of packageJsonPaths) {
  const packageJson = readJson(root, path);
  const dependencies = collectDependencies(packageJson);

  for (const [name, version] of Object.entries(dependencies)) {
    if (name.startsWith("@side-chat/")) {
      if (version !== "0.0.0")
        errors.push(`${path}: internal dependency ${name} must use exact 0.0.0`);
      continue;
    }

    if (!isExactVersion(version)) {
      errors.push(`${path}: dependency ${name} must use an exact version, got ${version}`);
    }
  }

  for (const [name, version] of Object.entries(requiredByPackage[packageJson.name] ?? {})) {
    if (dependencies[name] !== version) errors.push(`${path}: ${name} must be exactly ${version}`);
  }
}

failIfErrors(errors);
