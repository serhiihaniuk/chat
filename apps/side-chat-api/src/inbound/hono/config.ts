import { z } from "zod";

const parseBooleanLike = (value: string) => {
  if (typeof value !== "string") return true;
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "off", "no", "f"].includes(normalized)) return false;
  if (["1", "true", "on", "yes", "t"].includes(normalized)) return true;
  return true;
};

const sidechatEnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  SIDE_CHAT_MODEL_ADAPTER: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  SIDE_CHAT_ALLOWED_WORKSPACE_IDS: z.string().optional(),
  SIDE_CHAT_BLOCKED_WORKSPACE_IDS: z.string().optional(),
  SIDE_CHAT_RATE_LIMITING_ENABLED: z.preprocess((value) => {
    if (value === undefined) return true;
    return parseBooleanLike(String(value));
  }, z.boolean()),
  SIDE_CHAT_BILLING_ENABLED: z.preprocess((value) => {
    if (value === undefined) return true;
    return parseBooleanLike(String(value));
  }, z.boolean()),
  SIDE_CHAT_DEFAULT_USER_ID: z.string().default("local-user"),
  USE_FAKE_MODEL: z.preprocess((value) => {
    if (value === undefined) return true;
    return parseBooleanLike(String(value));
  }, z.boolean()),
});

export type SideChatApiEnv = z.output<typeof sidechatEnvSchema>;

export const parseSideChatEnv = (
  env: NodeJS.ProcessEnv = process.env,
): SideChatApiEnv => {
  const parsed = sidechatEnvSchema.safeParse(env);
  if (!parsed.success) {
    return {
      DATABASE_URL: undefined,
      SIDE_CHAT_MODEL_ADAPTER: env.SIDE_CHAT_MODEL_ADAPTER,
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      SIDE_CHAT_ALLOWED_WORKSPACE_IDS: env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS,
      SIDE_CHAT_BLOCKED_WORKSPACE_IDS: env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS,
      SIDE_CHAT_RATE_LIMITING_ENABLED: true,
      SIDE_CHAT_BILLING_ENABLED: true,
      SIDE_CHAT_DEFAULT_USER_ID: "local-user",
      USE_FAKE_MODEL: true,
    };
  }

  return parsed.data;
};
