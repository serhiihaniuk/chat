import { defineConfig } from "drizzle-kit";

// drizzle-kit owns table DDL only, via offline `generate`. The DB connection is
// config-driven and resolved by the service (apps/partner-ai-service
// `readDatabaseUrl`), then passed down to the apply step. Apply runs through
// `npm run db:reset` — never raw drizzle-kit migrate/push — so no connection url
// is read here. This keeps the service the single source for SIDECHAT_DATABASE_URL.
export default defineConfig({
  schema: "./src/drizzle/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: "" },
});
