import type { HostContext, JsonObject } from "@side-chat/chat-protocol";
import { optionalField } from "@side-chat/shared";

import type { HostCapabilities } from "#commands/capability";

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
  ...optionalField(
    "getCapabilities",
    capabilities ? () => Promise.resolve(capabilities) : undefined,
  ),
});

export const toProtocolHostContext = (snapshot: HostContextSnapshot): HostContext => ({
  schemaVersion: snapshot.schemaVersion,
  ...optionalField("origin", snapshot.origin || undefined),
  ...optionalField("url", snapshot.url || undefined),
  ...optionalField("title", snapshot.title || undefined),
  metadata: mergeMetadata(snapshot),
});

const mergeMetadata = (snapshot: HostContextSnapshot): JsonObject => ({
  ...snapshot.metadata,
  collectedAt: snapshot.collectedAt,
  ...optionalField("expiresAt", snapshot.expiresAt || undefined),
  ...optionalField("capabilityHash", snapshot.capabilityHash || undefined),
  ...optionalField("surface", snapshot.surface ? encodeSurface(snapshot.surface) : undefined),
});

const encodeSurface = (surface: HostSurface): JsonObject => ({
  surfaceId: surface.surfaceId,
  ...optionalField("resourceType", surface.resourceType || undefined),
  ...optionalField("resourceId", surface.resourceId || undefined),
});
