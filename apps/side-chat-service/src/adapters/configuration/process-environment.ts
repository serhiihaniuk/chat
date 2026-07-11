import { SERVICE_ENV_KEYS, type ServiceEnv } from "#ports/configuration/side-chat-config";

/**
 * This adapter is the only bridge from ambient process input to typed service
 * decisions. It exposes names and normalized values, never secret diagnostics.
 * Nitro consumes the Workflow world keys separately at build and engine boot.
 */

/** Closed value set for `SIDECHAT_TEST_COMPOSITION`. */
export const TEST_COMPOSITION = {
  ENABLED: "enabled",
} as const;

/** Read a trimmed env value, treating blank as absent. */
export const envValue = (env: ServiceEnv, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value ? value : undefined;
};

export interface ServiceMode {
  readonly useTestComposition: boolean;
}

export function readServiceMode(env: ServiceEnv): ServiceMode {
  return {
    useTestComposition:
      envValue(env, SERVICE_ENV_KEYS.TEST_COMPOSITION) === TEST_COMPOSITION.ENABLED,
  };
}

/** The sole handoff of the ambient process environment into boot composition. */
export const serviceProcessEnv = (): ServiceEnv => process.env;
