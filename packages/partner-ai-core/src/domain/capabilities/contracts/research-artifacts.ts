import type { JsonObject } from "@side-chat/shared";

export type ResearchArtifact = {
  readonly artifactId: string;
  readonly researchRunId: string;
  readonly researchAgentId: string;
  readonly artifactKind: string;
  readonly contentType: string;
  readonly payload: JsonObject;
  readonly createdAt: string;
};
