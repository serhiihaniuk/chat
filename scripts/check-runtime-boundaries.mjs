import {
  dependencyName,
  failIfErrors,
  importSpecifiers,
  listSourceFiles,
  packageArea,
  resolveRoot,
} from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = resolveRoot();
const errors = [];

for (const file of listSourceFiles(root)) {
  if (!file.includes("/src/")) continue;

  const area = packageArea(file);
  const source = readFileSync(join(root, file), "utf8");
  const imports = importSpecifiers(source).map(dependencyName).filter(Boolean);

  if (
    source.includes("process.env") &&
    !file.startsWith("apps/partner-ai-service/src/config/")
  ) {
    errors.push(
      `${file}: production source reads process.env outside a config adapter`,
    );
  }

  if (
    imports.some((name) => name === "pg" || name === "drizzle-orm") &&
    area !== "packages/db"
  ) {
    errors.push(`${file}: pg/Drizzle runtime imports are owned by packages/db`);
  }

  if (
    imports.some((name) => name === "hono" || name === "@hono/node-server") &&
    area !== "apps/partner-ai-service"
  ) {
    errors.push(
      `${file}: HTTP framework imports are owned by apps/partner-ai-service`,
    );
  }

  if (
    imports.some((name) => name === "ai" || name?.startsWith("@ai-sdk/")) &&
    area !== "packages/assistant-runtime"
  ) {
    errors.push(
      `${file}: AI SDK imports are owned by packages/assistant-runtime`,
    );
  }
}

failIfErrors(errors);
