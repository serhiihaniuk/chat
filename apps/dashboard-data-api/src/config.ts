import { z } from "zod";

/**
 * App-local environment boundary. Zod is appropriate here because this is
 * runtime configuration parsing, not the shared sidechat.v1 product protocol.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3100),
  DASHBOARD_DATA_SOURCE: z.enum(["postgres", "fixture"]).default("postgres"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://sidechat_app:sidechat_app@127.0.0.1:5432/sidechat"),
});

export type DashboardDataApiConfig = z.output<typeof envSchema>;

export const parseConfig = (
  env: NodeJS.ProcessEnv = process.env,
): DashboardDataApiConfig => envSchema.parse(env);
