import type { SideChatConfig } from "../types.js";

const definedSideChatConfigs = new WeakSet<object>();

/**
 * Preserve literal config values while checking the readable service shape.
 *
 * The config file may contain human-authored prompt text, but closed product
 * ids should arrive from catalog imports. Runtime validation later checks
 * cross-field relationships such as default model membership and tool exposure.
 */
export const defineSideChatConfig = <const Config extends SideChatConfig>(
  config: Config,
): Config => {
  definedSideChatConfigs.add(config);
  return config;
};

/**
 * Prove that a dynamically loaded value passed through {@link defineSideChatConfig}.
 *
 * Dynamic `import()` returns an untrusted namespace object. Keeping the proof in
 * a module-local `WeakSet` lets the loader narrow values without pretending that
 * an assertion validated the human-authored config shape.
 */
export const isDefinedSideChatConfig = (value: unknown): value is SideChatConfig =>
  typeof value === "object" && value !== null && definedSideChatConfigs.has(value);
