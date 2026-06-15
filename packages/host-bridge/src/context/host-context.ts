import type { HostContext } from "@side-chat/chat-protocol";
import { omitUndefinedProperties, type JsonObject } from "@side-chat/shared";

import type { HostCapabilities } from "#commands/capability";

export type HostSurface = {
  readonly surfaceId: string;
  readonly resourceType?: string | undefined;
  readonly resourceId?: string | undefined;
};

export type HostContextSnapshot = HostContext & {
  readonly collectedAt: string;
  readonly expiresAt?: string | undefined;
  readonly surface?: HostSurface | undefined;
  readonly capabilityHash?: string | undefined;
};

export type HostContextRequest = {
  readonly requestId: string;
  readonly now?: string | undefined;
};

export type HostContextProvider = {
  readonly getContext: (request: HostContextRequest) => Promise<HostContextSnapshot>;
  readonly getCapabilities?: (() => Promise<HostCapabilities>) | undefined;
};

export const createStaticHostContextProvider = (
  snapshot: HostContextSnapshot,
  capabilities?: HostCapabilities,
): HostContextProvider =>
  omitUndefinedProperties({
    getContext: () => Promise.resolve(snapshot),
    getCapabilities: capabilities ? () => Promise.resolve(capabilities) : undefined,
  });

export const toProtocolHostContext = (snapshot: HostContextSnapshot): HostContext =>
  omitUndefinedProperties({
    schemaVersion: snapshot.schemaVersion,
    origin: snapshot.origin === "" ? undefined : snapshot.origin,
    url: snapshot.url === "" ? undefined : snapshot.url,
    title: snapshot.title === "" ? undefined : snapshot.title,
    metadata: mergeMetadata(snapshot),
  });

const mergeMetadata = (snapshot: HostContextSnapshot): JsonObject =>
  omitUndefinedProperties({
    ...snapshot.metadata,
    collectedAt: snapshot.collectedAt,
    expiresAt: snapshot.expiresAt,
    capabilityHash: snapshot.capabilityHash,
    surface: snapshot.surface ? encodeSurface(snapshot.surface) : undefined,
  });

const encodeSurface = (surface: HostSurface): JsonObject =>
  omitUndefinedProperties({
    surfaceId: surface.surfaceId,
    resourceType: surface.resourceType,
    resourceId: surface.resourceId,
  });
