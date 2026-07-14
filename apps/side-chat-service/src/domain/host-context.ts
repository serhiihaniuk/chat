/** JSON values accepted inside the service-owned host page reference. */
export type HostContextJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly HostContextJsonValue[]
  | HostContextMetadata;

export interface HostContextMetadata {
  readonly [key: string]: HostContextJsonValue;
}

/**
 * Browser-supplied page reference for one turn. This value is untrusted user
 * data; it never proves identity, authorization, workspace scope, or policy.
 */
export type HostContext = Readonly<{
  schemaVersion: string;
  origin?: string | undefined;
  url?: string | undefined;
  title?: string | undefined;
  metadata?: HostContextMetadata | undefined;
}>;

/** Limits the HTTP adapter applies before host context enters the application. */
export type HostContextLimits = Readonly<{
  maxSerializedBytes: number;
  maxStringLength: number;
  maxMetadataDepth: number;
  maxMetadataEntries: number;
}>;
