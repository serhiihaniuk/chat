import type { HostContext, JsonObject } from "@side-chat/chat-protocol";

import type { HostCapabilities } from "./capability.js";

export type HostSurface = {
  readonly surfaceId: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
};

export type HostContextSnapshot = HostContext & {
  readonly collectedAt: string;
  readonly expiresAt?: string;
  readonly surface?: HostSurface;
  readonly capabilityHash?: string;
};

export type HostContextRequest = {
  readonly requestId: string;
  readonly now?: string;
};

export type HostContextProvider = {
  readonly getContext: (request: HostContextRequest) => Promise<HostContextSnapshot>;
  readonly getCapabilities?: () => Promise<HostCapabilities>;
};

export const createStaticHostContextProvider = (
  snapshot: HostContextSnapshot,
  capabilities?: HostCapabilities,
): HostContextProvider => ({
  getContext: () => Promise.resolve(snapshot),
  ...capabilitiesField(capabilities),
});

export const toProtocolHostContext = (snapshot: HostContextSnapshot): HostContext => ({
  schemaVersion: snapshot.schemaVersion,
  ...originField(snapshot.origin),
  ...urlField(snapshot.url),
  ...titleField(snapshot.title),
  metadata: mergeMetadata(snapshot),
});

const mergeMetadata = (snapshot: HostContextSnapshot): JsonObject => ({
  ...snapshot.metadata,
  collectedAt: snapshot.collectedAt,
  ...expiresAtField(snapshot.expiresAt),
  ...capabilityHashField(snapshot.capabilityHash),
  ...surfaceField(snapshot.surface),
});

const encodeSurface = (surface: HostSurface): JsonObject => ({
  surfaceId: surface.surfaceId,
  ...resourceTypeField(surface.resourceType),
  ...resourceIdField(surface.resourceId),
});

const capabilitiesField = (
  capabilities: HostCapabilities | undefined,
): { readonly getCapabilities?: () => Promise<HostCapabilities> } =>
  capabilities ? { getCapabilities: () => Promise.resolve(capabilities) } : {};

const originField = (origin: string | undefined): { readonly origin?: string } =>
  origin ? { origin } : {};

const urlField = (url: string | undefined): { readonly url?: string } => (url ? { url } : {});

const titleField = (title: string | undefined): { readonly title?: string } =>
  title ? { title } : {};

const expiresAtField = (expiresAt: string | undefined): { readonly expiresAt?: string } =>
  expiresAt ? { expiresAt } : {};

const capabilityHashField = (
  capabilityHash: string | undefined,
): { readonly capabilityHash?: string } => (capabilityHash ? { capabilityHash } : {});

const surfaceField = (surface: HostSurface | undefined): { readonly surface?: JsonObject } =>
  surface ? { surface: encodeSurface(surface) } : {};

const resourceTypeField = (resourceType: string | undefined): { readonly resourceType?: string } =>
  resourceType ? { resourceType } : {};

const resourceIdField = (resourceId: string | undefined): { readonly resourceId?: string } =>
  resourceId ? { resourceId } : {};
