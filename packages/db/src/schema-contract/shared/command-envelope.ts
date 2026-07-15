import type { WorkspaceId } from "../ids/persistence-ids.js";

export type RepositoryCommandEnvelope = {
  readonly workspaceId: WorkspaceId;
  readonly now: string;
};
