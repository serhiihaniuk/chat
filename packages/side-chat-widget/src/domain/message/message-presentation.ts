import type { CitationSource } from "@side-chat/shared-protocol";

import type {
  WidgetHostCommandPart,
  WidgetMessage,
  WidgetMessagePart,
  WidgetToolPart,
} from "./stream-event-state.js";
import { isUnknownRecord, readString } from "../../shared/lib/unknown-record.js";

/**
 * Presentation-domain rules: these helpers decide what the widget should show
 * for citations, attachments, tool labels, and visible context sizing without
 * importing React or browser lifecycle code.
 */
export type MessageAttachment = {
  id: string;
  name: string;
  url: string;
  mediaType?: string;
  size?: number;
};

export const recentContextMessageLimit = 12;
export const recentContextMessageCharacters = 1200;
export const recentContextTotalCharacters = 6000;

export const toolDisplayNames: Record<string, string> = {
  workbench_query: "Workbench data lookup",
  workbench_surface_context: "Current table context",
  generate_workbench_report: "PDF report",
};

export const getHostCommandToolStatus = (
  part: WidgetHostCommandPart,
): "running" | "completed" | "error" => {
  if (part.status === "pending") return "running";
  if (part.status === "applied") return "completed";
  return "error";
};

export const getVisibleContextCharacters = (
  messages: Array<{ role: string; content: string }>,
) => {
  const formattedLength = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-recentContextMessageLimit)
    .reduce((total, message) => {
      const normalized = message.content.replace(/\s+/g, " ").trim();
      return (
        total +
        message.role.length +
        2 +
        Math.min(normalized.length, recentContextMessageCharacters)
      );
    }, 0);

  return Math.min(formattedLength, recentContextTotalCharacters);
};

const readStringField = (value: unknown, field: string) => {
  if (!isUnknownRecord(value)) return undefined;
  return readString(value, field);
};

const resolveArtifactUrl = (url: string, baseUrl: string) => {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
};

const getReportAttachment = (
  tool: WidgetToolPart,
  apiEndpoint: string,
): MessageAttachment | undefined => {
  if (tool.toolName !== "generate_workbench_report" || tool.status !== "completed") {
    return undefined;
  }

  const reportUrl = readStringField(tool.output, "reportUrl");
  if (!reportUrl) return undefined;

  const title = readStringField(tool.output, "title");
  const fileName = readStringField(tool.output, "fileName");

  return {
    id: tool.toolCallId,
    name: getReportAttachmentName(title, fileName),
    url: resolveArtifactUrl(reportUrl, apiEndpoint),
    mediaType: "application/pdf",
  };
};

const getReportAttachmentName = (
  title: string | undefined,
  fileName: string | undefined,
) => {
  if (title) return `${title}.pdf`;
  if (fileName) return fileName;
  return "Workbench report.pdf";
};

const isAttachmentData = (value: unknown): value is MessageAttachment => {
  if (!isUnknownRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    (value.mediaType === undefined || typeof value.mediaType === "string") &&
    (value.size === undefined || typeof value.size === "number")
  );
};

export const getMetadataAttachments = (
  metadata: Record<string, unknown> | undefined,
  apiEndpoint: string,
): MessageAttachment[] => {
  const attachments = metadata?.attachments;
  return Array.isArray(attachments)
    ? attachments.filter(isAttachmentData).map((attachment) => ({
        ...attachment,
        url: resolveArtifactUrl(attachment.url, apiEndpoint),
      }))
    : [];
};

export const mergeAttachments = (
  attachments: MessageAttachment[],
): MessageAttachment[] => {
  const seen = new Set<string>();
  const merged: MessageAttachment[] = [];

  for (const attachment of attachments) {
    const key = `${attachment.url}::${attachment.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(attachment);
  }

  return merged;
};

export const isToolPart = (
  part: WidgetMessagePart,
): part is WidgetToolPart => part.type === "tool";

const isCitationSource = (value: unknown): value is CitationSource => {
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

const getToolSources = (output: unknown): CitationSource[] => {
  if (!isUnknownRecord(output)) return [];

  const sources = output.sources;
  return Array.isArray(sources) ? sources.filter(isCitationSource) : [];
};

const citationMetadataPattern =
  /\n*\s*<!-- sidechat-citations:([^]*?) -->\s*$/;

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

const getSourceSearchTerms = (source: CitationSource) => {
  const labelTail = getLabelTail(source.label);
  const rowLabel = getRowLabelFromId(source.rowId);

  return [labelTail, rowLabel, source.rowId, source.field]
    .filter((term): term is string => Boolean(term && term.length > 2))
    .map(normalizeCitationText);
};

const maxMatchedCitationSources = 2;

const isSurfaceCitationSource = (source: CitationSource) =>
  Boolean(source.resourceId);

const knownWorkbenchSources: CitationSource[] = [
  {
    sourceId: "client_portfolio_review:review-ackermann-family-office",
    label: "Client Portfolio Review · Ackermann Family Office",
    dataset: "client_portfolio_review",
    rowId: "review-ackermann-family-office",
  },
  {
    sourceId: "client_portfolio_review:review-bauhaus-enterprises-ag",
    label: "Client Portfolio Review · Bauhaus Enterprises AG",
    dataset: "client_portfolio_review",
    rowId: "review-bauhaus-enterprises-ag",
  },
  {
    sourceId: "client_portfolio_review:review-chen-private-wealth",
    label: "Client Portfolio Review · Chen Private Wealth",
    dataset: "client_portfolio_review",
    rowId: "review-chen-private-wealth",
  },
  {
    sourceId: "top_risk_accounts:risk-global-medtech-liquidity-gap",
    label: "Top Risk Accounts · Global MedTech Inc.",
    dataset: "top_risk_accounts",
    rowId: "risk-global-medtech-liquidity-gap",
  },
  {
    sourceId: "top_risk_accounts:risk-jasper-retail-credit-concentration",
    label: "Top Risk Accounts · Jasper Retail Group",
    dataset: "top_risk_accounts",
    rowId: "risk-jasper-retail-credit-concentration",
  },
  {
    sourceId: "advisoryWorklist:review-redwood-pharma-ag",
    label: "Portfolio Worklist - Redwood Pharma AG",
    dataset: "client_portfolio_review",
    resourceId: "advisoryWorklist",
    rowId: "review-redwood-pharma-ag",
  },
  {
    sourceId: "advisoryWorklist:review-helvetic-robotics-ag",
    label: "Portfolio Worklist - Helvetic Robotics AG",
    dataset: "client_portfolio_review",
    resourceId: "advisoryWorklist",
    rowId: "review-helvetic-robotics-ag",
  },
  {
    sourceId: "advisoryWorklist:review-meridian-shipping-sa",
    label: "Portfolio Worklist - Meridian Shipping SA",
    dataset: "client_portfolio_review",
    resourceId: "advisoryWorklist",
    rowId: "review-meridian-shipping-sa",
  },
  {
    sourceId: "advisoryWorklist:review-matterhorn-holdings",
    label: "Portfolio Worklist - Matterhorn Holdings",
    dataset: "client_portfolio_review",
    resourceId: "advisoryWorklist",
    rowId: "review-matterhorn-holdings",
  },
  {
    sourceId: "advisoryWorklist:review-silverline-retail-holding",
    label: "Portfolio Worklist - Silverline Retail Holding",
    dataset: "client_portfolio_review",
    resourceId: "advisoryWorklist",
    rowId: "review-silverline-retail-holding",
  },
  {
    sourceId: "advisoryWorklist:review-aurora-energy-sa",
    label: "Portfolio Worklist - Aurora Energy SA",
    dataset: "client_portfolio_review",
    resourceId: "advisoryWorklist",
    rowId: "review-aurora-energy-sa",
  },
];

export const inferInlineSourcesFromContent = (content: string) => {
  const normalizedContent = normalizeCitationText(content);
  const mentionsTopRisk = normalizedContent.includes("top risk");
  const mentionsClientReview = normalizedContent.includes("client portfolio");
  const inferred = knownWorkbenchSources.filter((source) => {
    const rowMentioned = getSourceSearchTerms(source).some((term) =>
      normalizedContent.includes(term),
    );
    if (!rowMentioned) return false;
    if (isSurfaceCitationSource(source)) return true;
    if (source.dataset === "top_risk_accounts") {
      return mentionsTopRisk || normalizedContent.includes("high priority");
    }
    if (source.dataset === "client_portfolio_review") {
      return mentionsClientReview || !mentionsTopRisk;
    }
    return true;
  });

  return inferred.slice(0, maxMatchedCitationSources);
};

export const selectInlineSources = (
  content: string,
  sources: CitationSource[],
) => {
  const uniqueSources = Array.from(
    new Map(sources.map((source) => [source.sourceId, source])).values(),
  );
  const normalizedContent = normalizeCitationText(content);
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

export const parseCitationMetadata = (content: string) => {
  const match = content.match(citationMetadataPattern);
  if (!match) return { content, sources: [] as CitationSource[] };

  const cleanContent = content.replace(citationMetadataPattern, "").trimEnd();
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    const sources = Array.isArray(parsed) ? parsed.filter(isCitationSource) : [];
    return { content: cleanContent, sources };
  } catch {
    return { content: cleanContent, sources: [] };
  }
};

const getMetadataSources = (
  metadata: Record<string, unknown> | undefined,
): CitationSource[] => {
  const citations = metadata?.citations;
  return Array.isArray(citations) ? citations.filter(isCitationSource) : [];
};

const getMessageAttachments = (
  parts: WidgetMessagePart[],
  apiEndpoint: string,
) =>
  parts
    .filter(isToolPart)
    .map((tool) => getReportAttachment(tool, apiEndpoint))
    .filter((attachment): attachment is MessageAttachment => Boolean(attachment));

const cleanReportResponseText = (content: string, hasAttachments: boolean) => {
  if (!hasAttachments) return content;

  return content
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return (
        !normalized.startsWith("download:") &&
        !normalized.startsWith("download/preview:") &&
        !/\/reports\/[0-9a-f-]+\.pdf/i.test(line)
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const getAssistantMessageView = (
  message: WidgetMessage,
  apiEndpoint: string,
) => {
  const assistantParts = message.parts ?? [];
  const attachments = mergeAttachments([
    ...getMessageAttachments(assistantParts, apiEndpoint),
    ...getMetadataAttachments(message.metadata, apiEndpoint),
  ]);
  const citationMetadata = parseCitationMetadata(message.content);
  const content = cleanReportResponseText(
    citationMetadata.content,
    attachments.length > 0,
  );
  const persistedSources = [
    ...getMetadataSources(message.metadata),
    ...citationMetadata.sources,
  ];
  const liveSources = assistantParts
    .filter(isToolPart)
    .filter((part) => part.status === "completed")
    .flatMap((part) => getToolSources(part.output));
  const inferredSources = inferInlineSourcesFromContent(content);

  return {
    assistantParts,
    attachments,
    content,
    inlineSources: selectInlineSources(content, [
      ...persistedSources,
      ...liveSources,
      ...inferredSources,
    ]),
  };
};
