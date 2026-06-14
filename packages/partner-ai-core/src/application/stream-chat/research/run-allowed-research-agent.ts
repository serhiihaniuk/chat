import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import { optionalField, type JsonObject } from "@side-chat/shared";
import { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import {
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  type ContextCandidate,
  type TurnPolicyDecision,
  type WorkflowArtifact,
} from "#domain/capabilities";
import type {
  ResearchAgentInput,
  ResearchAgentOutput,
  ResearchAgentPort,
  ResearchSourceCandidate,
} from "#ports";
import type { PartnerAiCoreError as PartnerAiCoreErrorType } from "#errors";
import { STREAM_CHAT_FAILURES, mapPortFailure } from "../errors/effect-failures.js";

const DEFAULT_RESEARCH_STEP_LIMIT = 4;
export const RESEARCH_CONTEXT_WORKFLOW_ID = "research_context" as const;

export type PreparedResearchContext = {
  readonly candidates: readonly ContextCandidate[];
  readonly workflowArtifacts: readonly WorkflowArtifact[];
};

export type RunAllowedResearchAgentInput = {
  readonly researchAgent: ResearchAgentPort;
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly request: ChatStreamRequest;
  readonly policyDecision: TurnPolicyDecision;
  readonly now: string;
  readonly abortSignal?: AbortSignal;
  readonly maxResearchSteps?: number;
  readonly workflowId?: string;
};

export const runAllowedResearchAgent = ({
  researchAgent,
  authContext,
  workspace,
  request,
  policyDecision,
  now,
  abortSignal,
  maxResearchSteps = DEFAULT_RESEARCH_STEP_LIMIT,
  workflowId = RESEARCH_CONTEXT_WORKFLOW_ID,
}: RunAllowedResearchAgentInput): Effect.Effect<
  PreparedResearchContext,
  PartnerAiCoreErrorType
> => {
  const allowedSourceIds = policyDecision.retrievalSourceIds;
  if (allowedSourceIds.length === 0 || !allowsResearchWorkflow(policyDecision, workflowId)) {
    return Effect.succeed(emptyResearchContext);
  }

  return mapPortFailure(
    researchAgent.runResearch(
      createResearchAgentInput({
        authContext,
        workspace,
        request,
        allowedSourceIds,
        maxResearchSteps,
        ...optionalField("abortSignal", abortSignal),
      }),
    ),
    STREAM_CHAT_FAILURES.CONTEXT,
  ).pipe(
    Effect.map((output) =>
      toPreparedResearchContext(output, request, allowedSourceIds, workflowId, now),
    ),
  );
};

const emptyResearchContext: PreparedResearchContext = {
  candidates: [],
  workflowArtifacts: [],
};

const createResearchAgentInput = ({
  authContext,
  workspace,
  request,
  allowedSourceIds,
  maxResearchSteps,
  abortSignal,
}: {
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly request: ChatStreamRequest;
  readonly allowedSourceIds: readonly string[];
  readonly maxResearchSteps: number;
  readonly abortSignal?: AbortSignal;
}): ResearchAgentInput => ({
  authContext,
  workspace,
  requestId: request.requestId,
  userMessage: request.message.content,
  ...optionalField("hostContext", request.hostContext),
  allowedSourceIds,
  maxResearchSteps,
  ...optionalField("abortSignal", abortSignal),
});

const toPreparedResearchContext = (
  output: ResearchAgentOutput,
  request: ChatStreamRequest,
  allowedSourceIds: readonly string[],
  workflowId: string,
  now: string,
): PreparedResearchContext => {
  const sourceCandidates = output.sources.filter((source) =>
    allowedSourceIds.includes(source.sourceId),
  );
  const artifact = createResearchArtifact(output, request, sourceCandidates, workflowId, now);
  const summaryCandidate = artifact
    ? [toResearchSummaryCandidate(output.summary, artifact, output.metadata)]
    : [];

  return {
    workflowArtifacts: artifact ? [artifact] : [],
    candidates: [
      ...summaryCandidate,
      ...sourceCandidates.map((source) => toResearchSourceContextCandidate(source, artifact)),
    ],
  };
};

const createResearchArtifact = (
  output: ResearchAgentOutput,
  request: ChatStreamRequest,
  sources: readonly ResearchSourceCandidate[],
  workflowId: string,
  now: string,
): WorkflowArtifact | undefined => {
  const summary = output.summary.trim();
  if (summary.length === 0) return undefined;

  const artifactId = output.artifactId ?? `research_artifact_${request.requestId}`;
  return {
    artifactId,
    workflowRunId: `${workflowId}_${request.requestId}`,
    nodeId: "research",
    artifactKind: "research_summary",
    contentType: "application/json",
    payload: {
      summary,
      sourceIds: sources.map((source) => source.sourceId),
      ...optionalField("metadata", output.metadata),
    } satisfies JsonObject,
    createdAt: now,
  };
};

const toResearchSummaryCandidate = (
  summary: string,
  artifact: WorkflowArtifact,
  metadata: JsonObject | undefined,
): ContextCandidate => ({
  candidateId: `research_summary_${artifact.artifactId}`,
  sourceType: CONTEXT_CANDIDATE_SOURCE_TYPES.WORKFLOW_ARTIFACT,
  sourceId: artifact.artifactId,
  trustLevel: CONTEXT_TRUST_LEVELS.GENERATED,
  redactionClass: CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
  content: summary,
  estimatedTokens: estimateTokens(summary),
  priority: 78,
  provenance: { sourceId: artifact.artifactId, label: "Research summary" },
  metadata: {
    workflowRunId: artifact.workflowRunId,
    nodeId: artifact.nodeId,
    ...optionalField("research", metadata),
  },
});

const toResearchSourceContextCandidate = (
  source: ResearchSourceCandidate,
  artifact: WorkflowArtifact | undefined,
): ContextCandidate => ({
  candidateId: `research_${source.candidateId}`,
  sourceType: CONTEXT_CANDIDATE_SOURCE_TYPES.RESEARCH_RESULT,
  sourceId: source.sourceId,
  trustLevel: source.trustLevel,
  redactionClass: source.redactionClass,
  content: source.content,
  estimatedTokens: source.estimatedTokens,
  priority: researchPriority(source.score),
  provenance: {
    sourceId: source.sourceId,
    label: source.title,
    ...optionalField("url", source.url),
  },
  metadata: {
    ...optionalField("artifactId", artifact?.artifactId),
    ...optionalField("source", source.metadata),
  },
});

const estimateTokens = (content: string): number => Math.max(1, Math.ceil(content.length / 4));

const researchPriority = (score: number): number =>
  Math.min(92, Math.max(45, Math.round(score * 100)));

const allowsResearchWorkflow = (decision: TurnPolicyDecision, workflowId: string): boolean =>
  decision.workflowPolicy.mode === "manifest_workflows" &&
  decision.workflowPolicy.allowedWorkflowIds.includes(workflowId);
