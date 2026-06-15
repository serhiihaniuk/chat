import { brandString, type Brand, type JsonObject } from "@side-chat/shared";
import type { ResearchAgentId } from "./capabilities.js";

export type ResearchArtifactId = Brand<string, "ResearchArtifactId">;
export type ResearchRunId = Brand<string, "ResearchRunId">;

export const toResearchArtifactId = (value: string): ResearchArtifactId =>
  brandString<"ResearchArtifactId">(value);
export const toResearchRunId = (value: string): ResearchRunId =>
  brandString<"ResearchRunId">(value);

export type ResearchArtifact = {
  readonly artifactId: ResearchArtifactId;
  readonly researchRunId: ResearchRunId;
  readonly researchAgentId: ResearchAgentId;
  readonly artifactKind: string;
  readonly contentType: string;
  readonly payload: JsonObject;
  readonly createdAt: string;
};
