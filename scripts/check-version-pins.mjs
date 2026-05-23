import {
  collectDependencies,
  failIfErrors,
  isExactVersion,
  isFile,
  listWorkspacePackageJsons,
  readJson,
  resolveRoot,
} from "./lib/governance.mjs";

const root = resolveRoot();
const errors = [];

const rootPackage = readJson(root, "package.json");

const requiredRoot = {
  typescript: "6.0.3",
  "@types/node": "24.12.4",
  tsx: "4.22.3",
  vitest: "4.1.7",
  "@effect/vitest": "4.0.0-beta.70",
  playwright: "1.60.0",
  eslint: "10.4.0",
  "@eslint/js": "10.0.1",
  "typescript-eslint": "8.59.4",
  "eslint-plugin-import-x": "4.16.2",
  "eslint-plugin-react-hooks": "7.1.1",
  "eslint-plugin-react-refresh": "0.5.2",
  "eslint-plugin-jsx-a11y": "6.10.2",
  "@vitest/eslint-plugin": "1.6.17",
  "eslint-plugin-unicorn": "64.0.0",
  globals: "17.6.0",
  prettier: "3.8.3",
  "eslint-config-prettier": "10.1.8",
  vite: "8.0.14",
  "@vitejs/plugin-react": "6.0.2",
  tailwindcss: "4.3.0",
  "@types/react": "19.2.15",
  "@types/react-dom": "19.2.3",
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
  },
  "@side-chat/partner-ai-core": {
    effect: "4.0.0-beta.70",
  },
  "@side-chat/db": {
    pg: "8.21.0",
    "@types/pg": "8.20.0",
    "drizzle-orm": "0.45.2",
    "drizzle-kit": "0.31.10",
    effect: "4.0.0-beta.70",
  },
  "@side-chat/side-chat-widget": {
    react: "19.2.6",
    "react-dom": "19.2.6",
    "@base-ui/react": "1.5.0",
    "class-variance-authority": "0.7.1",
    clsx: "2.1.1",
    "tailwind-merge": "3.6.0",
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

if (rootPackage.engines?.node !== "24.16.0")
  errors.push("root engines.node must be 24.16.0");
if (rootPackage.engines?.npm !== "11.15.0")
  errors.push("root engines.npm must be 11.15.0");
if (rootPackage.packageManager !== "npm@11.15.0")
  errors.push("root packageManager must be npm@11.15.0");
if (!isFile(root, ".nvmrc")) errors.push(".nvmrc is required");
if (
  isFile(root, ".nvmrc") &&
  readJson(root, "package.json") &&
  (await import("node:fs")).readFileSync(`${root}/.nvmrc`, "utf8").trim() !==
    "24.16.0"
) {
  errors.push(".nvmrc must contain 24.16.0");
}
if (!isFile(root, "package-lock.json"))
  errors.push("package-lock.json is required");

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
        errors.push(
          `${path}: internal dependency ${name} must use exact 0.0.0`,
        );
      continue;
    }

    if (!isExactVersion(version)) {
      errors.push(
        `${path}: dependency ${name} must use an exact version, got ${version}`,
      );
    }
  }

  for (const [name, version] of Object.entries(
    requiredByPackage[packageJson.name] ?? {},
  )) {
    if (dependencies[name] !== version)
      errors.push(`${path}: ${name} must be exactly ${version}`);
  }
}

failIfErrors(errors);
