import type { HostContext } from "@side-chat/chat-protocol";
import { omitUndefinedProperties, type JsonObject } from "@side-chat/shared";

/** Host resource currently visible to the user when context is collected. */
export type HostSurface = {
  readonly surfaceId: string;
  readonly resourceType?: string | undefined;
  readonly resourceId?: string | undefined;
};

/**
 * Rich host-owned context captured for one assistant request.
 *
 * The bridge moves collection metadata and surface identity into protocol
 * metadata before the request leaves the browser. Timestamps are ISO-8601
 * strings; callers must not treat this snapshot as authorization evidence.
 */
export type HostContextSnapshot = HostContext & {
  /** When the host observed this page state, as an ISO-8601 timestamp. */
  readonly collectedAt: string;
  /** Optional ISO-8601 expiry after which the service should treat the context as stale. */
  readonly expiresAt?: string | undefined;
  readonly surface?: HostSurface | undefined;
  readonly capabilityHash?: string | undefined;
};

/** Identity and optional host clock supplied while collecting request context. */
export type HostContextRequest = {
  readonly requestId: string;
  readonly now?: string | undefined;
};

/**
 * Host callback that collects page context for one explicit widget request.
 * Command capabilities are a separate bridge option.
 */
export type HostContextProvider = {
  readonly getContext: (request: HostContextRequest) => Promise<HostContextSnapshot>;
};

/** Build a provider that always returns one already-collected snapshot. */
export const createStaticHostContextProvider = (
  snapshot: HostContextSnapshot,
): HostContextProvider => ({
  getContext: () => Promise.resolve(snapshot),
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
