import type { ServiceEnv } from "../declaration/side-chat-config.js";

/**
 * This adapter is the only bridge from ambient process input to typed service
 * decisions. It exposes names and normalized values, never secret diagnostics.
 * Nitro consumes the Workflow world keys separately at build and engine boot.
 */

/** Read a trimmed env value, treating blank as absent. */
export const envValue = (env: ServiceEnv, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value ? value : undefined;
};

/** The sole handoff of the ambient process environment into boot composition. */
export const serviceProcessEnv = (): ServiceEnv => process.env;
