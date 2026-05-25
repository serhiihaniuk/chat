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
  ...(capabilities ? { getCapabilities: () => Promise.resolve(capabilities) } : {}),
});

export const toProtocolHostContext = (snapshot: HostContextSnapshot): HostContext => ({
  schemaVersion: snapshot.schemaVersion,
  ...(snapshot.origin ? { origin: snapshot.origin } : {}),
  ...(snapshot.url ? { url: snapshot.url } : {}),
  ...(snapshot.title ? { title: snapshot.title } : {}),
  metadata: mergeMetadata(snapshot),
});

const mergeMetadata = (snapshot: HostContextSnapshot): JsonObject => ({
  ...(snapshot.metadata ?? {}),
  collectedAt: snapshot.collectedAt,
  ...(snapshot.expiresAt ? { expiresAt: snapshot.expiresAt } : {}),
  ...(snapshot.capabilityHash ? { capabilityHash: snapshot.capabilityHash } : {}),
  ...(snapshot.surface ? { surface: encodeSurface(snapshot.surface) } : {}),
});

const encodeSurface = (surface: HostSurface): JsonObject => ({
  surfaceId: surface.surfaceId,
  ...(surface.resourceType ? { resourceType: surface.resourceType } : {}),
  ...(surface.resourceId ? { resourceId: surface.resourceId } : {}),
});
