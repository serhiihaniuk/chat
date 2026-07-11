import { defineConfig } from "drizzle-kit";

// drizzle-kit owns table DDL only, via offline `generate`. The DB connection is
// config-driven: `db:reset` reads SIDECHAT_DATABASE_URL from the environment and
// passes it down to the apply step. Apply runs through `npm run db:reset` — never
// raw drizzle-kit migrate/push — so no connection url is read here.
export default defineConfig({
  schema: "./src/drizzle/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: "" },
});
