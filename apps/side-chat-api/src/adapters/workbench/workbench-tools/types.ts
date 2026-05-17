import type {
  ClientPortfolioReviewRow,
  TopRiskAccountRow,
} from "@side-chat/db";
import type { HostGridViewState } from "#ports/index.js";

export type ClientPortfolioReviewToolRow = {
  id: string;
  clientId?: string;
  client: string;
  segment?: string;
  aumChf: number;
  netFlow30dChf?: number;
  coverageStatus: string;
  riskProfile: string;
  suitabilityScore?: number;
  lastReview?: string;
  relationshipManager?: string;
  nextAction: string;
  hasAlert: boolean;
};

export type TopRiskAccountToolRow = {
  id: string;
  clientId?: string;
  client: string;
  issue: string;
  exposureChf?: number;
  priority: "High" | "Medium" | "Low";
  owner?: string;
  dueDate?: string;
};

export type WorkbenchWorklistRow = {
  id: string;
  client: string;
  segment: string;
  aumChf: number;
  netFlow30dChf: number;
  coverageStatus: ClientPortfolioReviewRow["coverageStatus"];
  riskProfile: string;
  riskScore: number;
  relationshipManager: string;
  nextAction: string;
  hasAlert: boolean;
  riskIssue: string;
  riskExposureChf: number | null;
  priority: TopRiskAccountRow["priority"] | "None";
  dueDate: string;
  dueStatus: "Overdue" | "Due soon" | "Open" | "No risk";
};

export type WorklistFilter = NonNullable<HostGridViewState["filters"]>[number];
export type WorklistSortRule = NonNullable<HostGridViewState["sort"]>[number];
