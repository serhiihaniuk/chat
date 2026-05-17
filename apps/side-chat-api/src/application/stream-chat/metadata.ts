import type {
  ModelChunk,
  WorkbenchCitationSource,
  WorkbenchReportResult,
} from "#ports/index.js";
import { isUnknownRecord } from "../../shared/unknown-record.js";

export type StreamAttachment = {
  id: string;
  name: string;
  url: string;
  mediaType: string;
};

const isWorkbenchCitationSource = (
  value: unknown,
): value is WorkbenchCitationSource => {
  if (!isUnknownRecord(value)) return false;

  return (
    typeof value.sourceId === "string" &&
    typeof value.label === "string" &&
    typeof value.dataset === "string" &&
    (value.resourceId === undefined || typeof value.resourceId === "string") &&
    (value.rowId === undefined || typeof value.rowId === "string") &&
    (value.field === undefined || typeof value.field === "string")
  );
};

export const getToolCitationSources = (
  output: unknown,
): WorkbenchCitationSource[] => {
  if (!isUnknownRecord(output)) return [];

  const sources = output.sources;
  return Array.isArray(sources) ? sources.filter(isWorkbenchCitationSource) : [];
};

const isWorkbenchReportResult = (
  value: unknown,
): value is WorkbenchReportResult => {
  if (!isUnknownRecord(value)) return false;

  return (
    typeof value.reportId === "string" &&
    typeof value.reportUrl === "string" &&
    typeof value.title === "string" &&
    (value.fileName === undefined || typeof value.fileName === "string")
  );
};

export const getToolAttachment = (
  chunk: Extract<ModelChunk, { kind: "tool" }>,
): StreamAttachment | undefined => {
  if (
    chunk.toolName !== "generate_workbench_report" ||
    !isWorkbenchReportResult(chunk.output)
  ) {
    return undefined;
  }

  return {
    id: chunk.toolCallId,
    name: `${chunk.output.title}.pdf`,
    url: chunk.output.reportUrl,
    mediaType: "application/pdf",
  };
};

const normalizeCitationText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getLabelTail = (label: string) =>
  label.split(/\s(?:·|-)\s/).at(-1)?.trim();

const getRowLabelFromId = (rowId: string | undefined) =>
  rowId?.replace(/^(?:review|risk|client|kpi)-/, "");

const getSourceSearchTerms = (source: WorkbenchCitationSource) => {
  const labelTail = getLabelTail(source.label);
  const rowLabel = getRowLabelFromId(source.rowId);

  return [labelTail, rowLabel, source.rowId, source.field]
    .filter((term): term is string => Boolean(term && term.length > 2))
    .map(normalizeCitationText);
};

const maxMatchedCitationSources = 2;

const isSurfaceCitationSource = (source: WorkbenchCitationSource) =>
  Boolean(source.resourceId);

export const selectInlineCitationSources = (
  assistantContent: string,
  sources: WorkbenchCitationSource[],
): WorkbenchCitationSource[] => {
  const uniqueSources = Array.from(
    new Map(sources.map((source) => [source.sourceId, source])).values(),
  );

  const normalizedContent = normalizeCitationText(assistantContent);
  const matchedSources = uniqueSources.filter((source) =>
    getSourceSearchTerms(source).some((term) => normalizedContent.includes(term)),
  );
  if (matchedSources.length > 0) {
    return matchedSources.slice(0, maxMatchedCitationSources);
  }

  return uniqueSources
    .filter((source) => !isSurfaceCitationSource(source))
    .slice(0, 1);
};

/**
 * Final assistant metadata is deliberately selected by the use case, not the
 * provider adapter, so persistence and protocol metadata stay product-owned.
 */
export const createAssistantMetadata = (
  assistantContent: string,
  citationSources: WorkbenchCitationSource[],
  attachments: StreamAttachment[],
): Record<string, unknown> | undefined => {
  const selectedCitationSources = selectInlineCitationSources(
    assistantContent,
    citationSources,
  );
  const metadata: Record<string, unknown> = {};

  if (selectedCitationSources.length > 0) {
    metadata.citations = selectedCitationSources;
  }

  if (attachments.length > 0) {
    metadata.attachments = attachments;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};
