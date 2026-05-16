import { z } from "zod";

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
