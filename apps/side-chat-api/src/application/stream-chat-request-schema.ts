import { Effect, Schema } from "effect";
import type { SidechatRequest } from "@side-chat/shared-protocol";

import { InvalidRequest } from "./errors.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const Metadata = Schema.Record(Schema.String, Schema.Unknown);
const MutableNonEmptyStringArray = Schema.mutable(Schema.Array(NonEmptyString));

const ChatMessage = Schema.Struct({
  id: NonEmptyString,
  role: Schema.Literals(["user", "assistant", "system"]),
  content: NonEmptyString,
  metadata: Schema.optionalKey(Metadata),
});

const ModelSelection = Schema.Struct({
  provider: NonEmptyString,
  id: NonEmptyString,
  reasoningEffort: Schema.optionalKey(
    Schema.Literals(["none", "minimal", "low", "medium", "high", "xhigh"]),
  ),
});

const HostResourceColumn = Schema.Struct({
  id: NonEmptyString,
  label: NonEmptyString,
  type: Schema.Literals([
    "text",
    "number",
    "date",
    "boolean",
    "currency",
    "percent",
    "custom",
  ]),
  description: Schema.optionalKey(Schema.String),
  sortable: Schema.optionalKey(Schema.Boolean),
  filterable: Schema.optionalKey(Schema.Boolean),
});

const HostResource = Schema.Struct({
  id: NonEmptyString,
  kind: Schema.Literals(["grid", "table", "chart", "form", "page", "custom"]),
  label: NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  rowCount: Schema.optionalKey(
    Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(0),
    ),
  ),
  columns: Schema.optionalKey(Schema.mutable(Schema.Array(HostResourceColumn))),
  metadata: Schema.optionalKey(Metadata),
});

const HostCapability = Schema.Struct({
  id: NonEmptyString,
  label: NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  commandTypes: Schema.optionalKey(MutableNonEmptyStringArray),
});

const HostContextSnapshot = Schema.Struct({
  pageId: NonEmptyString,
  title: NonEmptyString,
  summary: Schema.optionalKey(Schema.String),
  resources: Schema.optionalKey(Schema.mutable(Schema.Array(HostResource))),
  capabilities: Schema.optionalKey(Schema.mutable(Schema.Array(HostCapability))),
  metadata: Schema.optionalKey(Metadata),
});

export const SidechatRequestEffectSchema = Schema.Struct({
  workspaceId: NonEmptyString,
  conversationId: Schema.optionalKey(Schema.String),
  message: ChatMessage,
  model: ModelSelection,
  hostContext: Schema.optionalKey(HostContextSnapshot),
});

export const decodeSidechatRequestEffect = (
  body: unknown,
): Effect.Effect<SidechatRequest, InvalidRequest, never> =>
  Schema.decodeUnknownEffect(SidechatRequestEffectSchema)(body).pipe(
    Effect.map((request): SidechatRequest => request),
    Effect.mapError(() => new InvalidRequest()),
  );
