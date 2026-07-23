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
    !file.endsWith(".test.ts") &&
    !file.startsWith("apps/side-chat-service/src/config/")
  ) {
    errors.push(`${file}: production source reads process.env outside a config adapter`);
  }

  if (imports.some((name) => name === "pg" || name === "drizzle-orm") && area !== "packages/db") {
    errors.push(`${file}: pg/Drizzle runtime imports are owned by packages/db`);
  }

  if (
    imports.some((name) => name === "hono" || name === "@hono/node-server") &&
    area !== "apps/side-chat-service"
  ) {
    errors.push(`${file}: HTTP framework imports are owned by apps/side-chat-service`);
  }

  if (
    imports.some((name) => name === "ai" || name?.startsWith("@ai-sdk/")) &&
    area !== "apps/side-chat-service" &&
    !isWidgetWorkflowPath(file) &&
    !(
      importsUseOnlyAiPackage(imports) &&
      file.startsWith("packages/side-chat-widget/src/shared/ai/")
    )
  ) {
    errors.push(`${file}: AI SDK imports are owned by apps/side-chat-service`);
  }
}

failIfErrors(errors);

function importsUseOnlyAiPackage(imports) {
  return (
    imports.some((name) => name === "ai") && !imports.some((name) => name?.startsWith("@ai-sdk/"))
  );
}

// The widget exception is limited to the AI SDK's browser Workflow transport
// surface. Provider adapters and server execution remain service-owned.
function isWidgetWorkflowPath(file) {
  return (
    file.startsWith("packages/side-chat-widget/src/entities/workflow-chat/") ||
    file.startsWith("packages/side-chat-widget/src/features/workflow-chat/") ||
    file ===
      "packages/side-chat-widget/src/widgets/side-chat/ui/workflow/workflow-side-chat-widget.tsx"
  );
}
