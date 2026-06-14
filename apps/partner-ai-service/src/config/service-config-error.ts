export class ServiceConfigError extends Error {
  readonly code = "service_config_invalid";

  constructor(message: string) {
    super(message);
    this.name = "ServiceConfigError";
  }
}
