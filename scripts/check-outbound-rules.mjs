import { failIfErrors, listSourceFiles, resolveRoot } from "./lib/governance.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = resolveRoot();
const errors = [];

for (const file of listSourceFiles(root)) {
  if (!file.includes("/src/")) continue;
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;

  const source = readFileSync(join(root, file), "utf8");
  const hasOutboundCall = /\bfetch\s*\(|new\s+WebSocket\b|new\s+EventSource\b/.test(source);
  const allowed =
    file.startsWith("apps/partner-ai-service/src/outbound/") ||
    file.startsWith("packages/agent-runtime/src/adapters/") ||
    file === "packages/side-chat-widget/src/shared/ai/prompt-input.tsx";

  if (hasOutboundCall && !allowed) {
    errors.push(
      `${file}: outbound network calls must live in approved outbound/provider adapter folders`,
    );
  }
}

failIfErrors(errors);
