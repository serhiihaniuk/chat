import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const exact = {
  effect: "4.0.0-beta.66",
  hono: "4.12.18",
  ai: "6.0.182",
  "@ai-sdk/react": "3.0.184",
  "@ai-sdk/openai": "3.0.63",
  streamdown: "2.5.0",
  react: "19.2.6",
  "react-dom": "19.2.6",
  vite: "8.0.13",
  "@vitejs/plugin-react": "6.0.2",
  typescript: "6.0.3",
  vitest: "4.1.6",
  "@playwright/test": "1.60.0",
  pg: "8.20.0",
  "@types/pg": "8.20.0",
  zod: "4.4.3",
  tsx: "4.22.0",
  "@types/node": "25.8.0",
  "ai-elements": "1.9.0",
  shadcn: "4.7.0",
  tailwindcss: "4.3.0",
  "lucide-react": "1.16.0",
  "class-variance-authority": "0.7.1",
  clsx: "2.1.1",
  "tailwind-merge": "3.4.0",
  eslint: "10.3.0",
  prettier: "3.8.3",
  tsup: "8.5.1",
};
const skipDirs = new Set([".git", "node_modules", "dist", ".omx"]);
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else files.push(p);
  }
}
walk(root);
function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}
function relPath(file) {
  return relative(root, file).replaceAll("\\", "/");
}

for (const file of files.filter((f) => f.endsWith("package.json"))) {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (/poc/i.test(pkg.name ?? ""))
    fail(
      `package name contains prohibited POC naming: ${relPath(file)}`,
    );
  for (const section of ["dependencies", "devDependencies", "peerDependencies"])
    for (const [name, version] of Object.entries(pkg[section] ?? {}))
      if (
        exact[name] &&
        version !== exact[name] &&
        !version.startsWith("0.1.0")
      )
        fail(
          `${relPath(file)} ${name}=${version}, expected ${exact[name]}`,
        );
}
for (const file of files) {
  const rel = relPath(file);
  if (
    rel.startsWith("apps/embedded-host-app") &&
    /\.(md|tsx?|jsx?|json|html|css)$/.test(file)
  ) {
    const text = readFileSync(file, "utf8");
    if (
      /(side-chat-widget\/src|packages\/side-chat-widget|\.\.\/\.\.\/packages\/side-chat-widget)/.test(
        text,
      )
    )
      fail(
        `embedded host references internal widget source/package path: ${rel}`,
      );
  }
  if (/\.md$|package\.json$|\.tsx?$/.test(file)) {
    const text = readFileSync(file, "utf8");
    if (!rel.startsWith(".omx") && /\bpoc\b/i.test(text))
      fail(`prohibited POC naming in ${rel}`);
    if (
      /from ['"]hono/.test(text) &&
      !rel.startsWith("apps/side-chat-api/src/inbound/hono/") &&
      !rel.startsWith("apps/dashboard-data-api/src/")
    )
      fail(`hono import outside inbound adapter: ${rel}`);
    if (
      /from ['"](@ai-sdk|ai['"])/.test(text) &&
      !rel.startsWith("apps/side-chat-api/src/adapters/ai/") &&
      !rel.startsWith("packages/side-chat-widget/src/components/ai-elements/")
    )
      fail(`AI SDK import outside ai adapter: ${rel}`);
    if (/from ['"]pg['"]/.test(text) && !rel.startsWith("packages/db/"))
      fail(`pg import outside db package: ${rel}`);
    if (
      rel.startsWith("packages/shared-protocol") &&
      /from ['"](react|hono|effect|pg|@ai-sdk|ai['"])/.test(text)
    )
      fail(`shared-protocol boundary violation: ${rel}`);
    if (
      rel.startsWith("packages/db") &&
      /from ['"](react|hono|@ai-sdk|ai['"])/.test(text)
    )
      fail(`db boundary violation: ${rel}`);
    if (
      rel.startsWith("packages/side-chat-widget/src/components/ai-elements") &&
      /(@\/|next\/|@ai-sdk\/react)/.test(text)
    )
      fail(`AI Elements component forbidden import: ${rel}`);
  }
}
const sql = readFileSync(
  join(root, "docker/postgres/init/001_schema.sql"),
  "utf8",
);
for (const fn of [
  "sidechat_create_or_get_conversation",
  "sidechat_append_user_message",
  "sidechat_append_assistant_message",
  "sidechat_read_seeded_history",
  "sidechat_record_usage",
])
  if (!sql.includes(`function ${fn}`)) fail(`missing sql function ${fn}`);
if (!/revoke all on all tables in schema sidechat from sidechat_app/i.test(sql))
  fail("missing direct table grant revocation");
if (!process.exitCode)
  console.log(
    "PASS governance: dependency pins, no POC naming, boundaries, AI Elements imports, and stored procedures",
  );
