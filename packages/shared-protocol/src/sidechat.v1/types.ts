import type { Schema } from "effect";
import type {
  ChatMessageSchema,
  CitationSourceSchema,
  HostCapabilitySchema,
  HostCommandResultSchema,
  HostCommandSchema,
  HostContextSnapshotSchema,
  HostCustomCommandSchema,
  HostFocusResourceCommandSchema,
  HostGridClearCommandSchema,
  HostGridFilterSchema,
  HostGridSortSchema,
  HostGridViewCommandSchema,
  HostResourceColumnSchema,
  HostResourceColumnTypeSchema,
  HostResourceKindSchema,
  HostResourceSchema,
  ModelSelectionSchema,
  RoleSchema,
  SidechatRequestSchema,
  SidechatStreamCompletedEventSchema,
  SidechatStreamDeltaEventSchema,
  SidechatStreamErrorEventSchema,
  SidechatStreamEventSchema,
  SidechatStreamHistoryEventSchema,
  SidechatStreamHostCommandEventSchema,
  SidechatStreamReasoningEventSchema,
  SidechatStreamStartEventSchema,
  SidechatStreamToolEventSchema,
  SidechatTokenUsageSchema,
} from "./schemas.js";

export const SidechatProtocolVersion = "sidechat.v1" as const;

type MutableDeep<T> = T extends readonly (infer Item)[]
  ? MutableDeep<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: MutableDeep<T[Key]> }
    : T;

type SchemaType<S extends Schema.Decoder<unknown>> = MutableDeep<S["Type"]>;

export type Role = SchemaType<typeof RoleSchema>;
export type ChatMessage = SchemaType<typeof ChatMessageSchema>;
export type CitationSource = SchemaType<typeof CitationSourceSchema>;
export type ModelSelection = SchemaType<typeof ModelSelectionSchema>;

export type HostResourceKind = SchemaType<typeof HostResourceKindSchema>;
export type HostResourceColumnType = SchemaType<
  typeof HostResourceColumnTypeSchema
>;
export type HostResourceColumn = SchemaType<typeof HostResourceColumnSchema>;
export type HostGridFilter = SchemaType<typeof HostGridFilterSchema>;
export type HostGridSort = SchemaType<typeof HostGridSortSchema>;
export type HostResource = SchemaType<typeof HostResourceSchema>;
export type HostCapability = SchemaType<typeof HostCapabilitySchema>;
export type HostContextSnapshot = SchemaType<typeof HostContextSnapshotSchema>;

export type HostGridViewCommand = SchemaType<typeof HostGridViewCommandSchema>;
export type HostGridClearCommand = SchemaType<typeof HostGridClearCommandSchema>;
export type HostFocusResourceCommand = SchemaType<
  typeof HostFocusResourceCommandSchema
>;
export type HostCustomCommand = SchemaType<typeof HostCustomCommandSchema>;
export type HostCommand = SchemaType<typeof HostCommandSchema>;
export type HostCommandResult = SchemaType<typeof HostCommandResultSchema>;

export type TokenUsage = SchemaType<typeof SidechatTokenUsageSchema>;
export type SidechatStreamStartEvent = SchemaType<
  typeof SidechatStreamStartEventSchema
>;
export type SidechatStreamDeltaEvent = SchemaType<
  typeof SidechatStreamDeltaEventSchema
>;
export type SidechatStreamReasoningEvent = SchemaType<
  typeof SidechatStreamReasoningEventSchema
>;
export type SidechatStreamToolEvent = SchemaType<
  typeof SidechatStreamToolEventSchema
>;
export type SidechatStreamHostCommandEvent = SchemaType<
  typeof SidechatStreamHostCommandEventSchema
>;
export type SidechatStreamCompletedEvent = SchemaType<
  typeof SidechatStreamCompletedEventSchema
>;
export type SidechatStreamErrorEvent = SchemaType<
  typeof SidechatStreamErrorEventSchema
>;
export type SidechatStreamHistoryEvent = SchemaType<
  typeof SidechatStreamHistoryEventSchema
>;
export type SidechatStreamEvent = SchemaType<typeof SidechatStreamEventSchema>;
export type SidechatRequest = SchemaType<typeof SidechatRequestSchema>;

export interface SidechatRequestHeaders {
  protocol: typeof SidechatProtocolVersion;
  requestId?: string;
}
