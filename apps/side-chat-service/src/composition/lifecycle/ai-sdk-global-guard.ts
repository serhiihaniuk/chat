export class ServiceStartupError extends Error {
  constructor(
    readonly code: "ai_sdk_default_provider_set" | "telemetry_already_registered",
    message: string,
  ) {
    super(message);
    this.name = "ServiceStartupError";
  }
}

/** A global provider would turn accidental string ids into implicit Gateway traffic. */
export function assertAiSdkDefaultProviderIsUnset(): void {
  if (globalThis.AI_SDK_DEFAULT_PROVIDER === undefined) return;
  throw new ServiceStartupError(
    "ai_sdk_default_provider_set",
    "AI SDK default provider must be unset; construct provider model instances explicitly",
  );
}
