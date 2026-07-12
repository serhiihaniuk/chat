import {
  collectDependencies,
  failIfErrors,
  isExactVersion,
  isFile,
  listWorkspacePackageJsons,
  readJson,
  resolveRoot,
} from "./lib/governance.mjs";

// Node and npm tool-version validation is intentionally not enforced here; this
// check pins only the dependency versions (for reproducible installs) and the
// presence of the lockfile.
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
  oxlint: "1.66.0",
  "oxlint-tsgolint": "0.23.0",
  oxfmt: "0.51.0",
  vite: "8.1.0",
  "@vitejs/plugin-react": "6.0.2",
  tailwindcss: "4.3.0",
  testcontainers: "12.0.0",
  "@types/react": "19.2.15",
  "@types/react-dom": "19.2.3",
  "happy-dom": "20.9.0",
};

const requiredByPackage = {
  "@side-chat/partner-ai-service": {
    hono: "4.12.27",
    "@hono/node-server": "2.0.3",
    effect: "4.0.0-beta.70",
    "@effect/platform-node": "4.0.0-beta.70",
  },
  "@side-chat/side-chat-service": {
    ai: "7.0.22",
    "@ai-sdk/provider": "4.0.3",
    "@ai-sdk/workflow": "1.0.22",
    workflow: "5.0.0-beta.30",
    "@workflow/serde": "5.0.0-beta.2",
    "@workflow/world-postgres": "5.0.0-beta.24",
    nitro: "3.0.260610-beta",
    rollup: "4.62.2",
    hono: "4.12.27",
  },
  "@side-chat/agent-runtime": {
    ai: "6.0.191",
    "@ai-sdk/azure": "3.0.65",
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
    ai: "7.0.22",
    "@ai-sdk/react": "4.0.23",
    "@ai-sdk/workflow": "1.0.22",
    react: "19.2.6",
    "react-dom": "19.2.6",
    "@base-ui/react": "1.5.0",
    clsx: "2.1.1",
    "lucide-react": "1.16.0",
    streamdown: "2.5.0",
    "tailwind-merge": "3.6.0",
    "use-stick-to-bottom": "1.1.4",
  },
  "@side-chat/widget-harness": {
    react: "19.2.6",
    "react-dom": "19.2.6",
    vite: "8.1.0",
    "@vitejs/plugin-react": "6.0.2",
    tailwindcss: "4.3.0",
    "@tailwindcss/vite": "4.3.0",
  },
};

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
