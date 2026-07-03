export * from "./composition/capabilities/status/capability-status.js";
export * from "./composition/service-composition.js";
export * from "./inbound/http/app.js";
// The auth seam: adopters implement `ServiceAuthVerifier` (headers → AuthContext)
// and pass it as `authVerifier`. The config types stay exported for the built-in
// static-token adapters used in development.
export type {
  HostProvidedContext,
  ServiceAuthConfig,
  ServiceAuthInput,
  ServiceAuthVerifier,
} from "#adapters/auth/service-auth";
