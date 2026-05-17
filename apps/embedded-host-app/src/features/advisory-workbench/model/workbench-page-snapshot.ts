import type {
  AdvisoryDashboardSnapshot,
  AdvisoryKpi,
  ClientPortfolioReviewRow,
  NetNewMoneyTrendPoint,
  RiskDriverExposureRow,
  RiskExposureTrendPoint,
  SegmentRiskScoreRow,
  TopRiskAccountRow,
} from "./advisory-dashboard.types.js";
import {
  createDueWindowRange,
  defaultWorkbenchControlState,
  type WorkbenchControlState,
  type WorkbenchRiskCategory,
} from "./workbench-controls.js";
import {
  createWorklistRows,
  getDueStatus,
  type AdvisoryWorklistRow,
} from "./worklist-model.js";

type RiskLayerTotals = {
  highRiskAumChf: number;
  lowRiskAumChf: number;
  mediumRiskAumChf: number;
  noRiskAumChf: number;
};

const riskDriverOrder = [
  "Liquidity gap",
  "Margin pressure",
  "Credit concentration",
  "Collateral shortfall",
  "Market volatility",
  "Other",
];

/**
 * Builds the page-level selected dashboard state from the command bar.
 * Charts, KPIs, host context, and table all consume this projection so the
 * current page selection is the single visible truth.
 */
export const createWorkbenchPageSnapshot = (
  snapshot: AdvisoryDashboardSnapshot,
  controls: WorkbenchControlState,
): AdvisoryDashboardSnapshot => {
  if (isDefaultControlState(controls)) return snapshot;

  const allRows = createWorklistRows(snapshot);
  const selectedRows = allRows.filter((row) =>
    matchesWorkbenchControls(row, controls, snapshot.asOfDate),
  );
  const selectedClientIds = new Set(selectedRows.map((row) => row.clientId));
  const selectedClients = snapshot.clientPortfolioReview.filter((client) =>
    selectedClientIds.has(client.clientId),
  );
  const selectedRiskAccounts = snapshot.topRiskAccounts.filter(
    (riskAccount) =>
      selectedClientIds.has(riskAccount.clientId) &&
      matchesRiskAccountControls(riskAccount, snapshot.asOfDate, controls),
  );

  return {
    ...snapshot,
    clientPortfolioReview: selectedClients,
    kpis: createSelectedKpis(snapshot.kpis, selectedClients, selectedRows, snapshot),
    netNewMoneyTrend: createSelectedNetNewMoneyTrend(
      snapshot.netNewMoneyTrend,
      selectedClients,
      snapshot.clientPortfolioReview,
    ),
    riskDriverExposure: createSelectedRiskDriverExposure(selectedRiskAccounts),
    riskExposureTrend: createSelectedRiskExposureTrend(
      snapshot.riskExposureTrend,
      selectedRows,
      allRows,
    ),
    segmentRiskScores: createSelectedSegmentRiskScores(
      snapshot.segmentRiskScores,
      selectedRows,
      allRows,
      controls,
    ),
    topRiskAccounts: selectedRiskAccounts,
  };
};

const matchesWorkbenchControls = (
  row: AdvisoryWorklistRow,
  controls: WorkbenchControlState,
  asOfDate: string,
) => {
  if (controls.viewQueue === "riskQueue" && row.priority === "None") {
    return false;
  }
  if (controls.viewQueue === "dueSoon" && row.dueStatus !== "Due soon") {
    return false;
  }
  if (controls.clientSegment !== "all" && row.segment !== controls.clientSegment) {
    return false;
  }
  if (controls.priority !== "all" && row.priority !== controls.priority) {
    return false;
  }
  if (
    controls.riskCategory !== "all" &&
    !riskTextMatchesCategory(row.riskIssue, controls.riskCategory)
  ) {
    return false;
  }
  if (controls.dueStatus !== "all" && row.dueStatus !== controls.dueStatus) {
    return false;
  }
  if (!dateMatchesDueWindow(row.dueDate, controls, asOfDate)) {
    return false;
  }
  if (controls.rmAdvisor !== "all" && row.relationshipManager !== controls.rmAdvisor) {
    return false;
  }
  if (
    controls.quickFilters.includes("largestOutflow") &&
    row.netFlow30dChf >= 0
  ) {
    return false;
  }
  if (controls.quickFilters.includes("overdue") && row.dueStatus !== "Overdue") {
    return false;
  }
  if (controls.quickFilters.includes("highPriority") && row.priority !== "High") {
    return false;
  }

  return true;
};

const matchesRiskAccountControls = (
  riskAccount: TopRiskAccountRow,
  asOfDate: string,
  controls: WorkbenchControlState,
) => {
  const dueStatus = getDueStatus(riskAccount.dueDate, asOfDate);

  if (controls.viewQueue === "dueSoon" && dueStatus !== "Due soon") {
    return false;
  }
  if (controls.priority !== "all" && riskAccount.priority !== controls.priority) {
    return false;
  }
  if (
    controls.riskCategory !== "all" &&
    !riskTextMatchesCategory(riskAccount.issue, controls.riskCategory)
  ) {
    return false;
  }
  if (controls.dueStatus !== "all" && dueStatus !== controls.dueStatus) {
    return false;
  }
  if (!dateMatchesDueWindow(riskAccount.dueDate, controls, asOfDate)) {
    return false;
  }
  if (controls.rmAdvisor !== "all" && riskAccount.owner !== controls.rmAdvisor) {
    return false;
  }
  if (
    controls.quickFilters.includes("overdue") &&
    dueStatus !== "Overdue"
  ) {
    return false;
  }
  if (
    controls.quickFilters.includes("highPriority") &&
    riskAccount.priority !== "High"
  ) {
    return false;
  }

  return true;
};

const createSelectedKpis = (
  originalKpis: AdvisoryKpi[],
  selectedClients: ClientPortfolioReviewRow[],
  selectedRows: AdvisoryWorklistRow[],
  snapshot: AdvisoryDashboardSnapshot,
): AdvisoryKpi[] => {
  const totalAum = sumBy(selectedClients, (row) => row.aumChf);
  const totalDashboardAum = sumBy(
    snapshot.clientPortfolioReview,
    (row) => row.aumChf,
  );
  const netNewMoney = sumBy(selectedClients, (row) => row.netFlow30dChf);
  const coveredCount = selectedClients.filter(
    (client) => client.coverageStatus === "Covered",
  ).length;
  const atRiskCount = selectedRows.filter((row) => row.priority !== "None").length;
  const selectedCount = selectedClients.length;

  return originalKpis.map((kpi) => {
    if (kpi.label === "Total AUM") {
      return {
        ...kpi,
        delta: `${formatPercent(totalAum, totalDashboardAum)}% selected`,
        trend: "neutral",
        value: formatChf(totalAum),
      };
    }
    if (kpi.label === "Net New Money") {
      return {
        ...kpi,
        delta: selectedCount === 1 ? "1 selected client" : `${selectedCount} selected clients`,
        trend: netNewMoney < 0 ? "negative" : "positive",
        value: formatChf(netNewMoney),
      };
    }
    if (kpi.label === "Advisory Coverage") {
      return {
        ...kpi,
        delta: `${coveredCount} covered`,
        trend: "neutral",
        value: `${formatPercent(coveredCount, selectedCount)}%`,
      };
    }
    if (kpi.label === "At-Risk Accounts") {
      return {
        ...kpi,
        delta: `${formatPercent(atRiskCount, Math.max(selectedCount, 1))}% of selection`,
        trend: atRiskCount > 0 ? "negative" : "neutral",
        value: String(atRiskCount),
      };
    }
    return kpi;
  });
};

const createSelectedNetNewMoneyTrend = (
  trend: NetNewMoneyTrendPoint[],
  selectedClients: ClientPortfolioReviewRow[],
  allClients: ClientPortfolioReviewRow[],
): NetNewMoneyTrendPoint[] => {
  const selectedFlow = sumBy(selectedClients, (row) => row.netFlow30dChf);
  const totalFlow = sumBy(allClients, (row) => row.netFlow30dChf);
  const selectedAum = sumBy(selectedClients, (row) => row.aumChf);
  const totalAum = sumBy(allClients, (row) => row.aumChf);
  const scale =
    totalFlow !== 0 ? selectedFlow / totalFlow : safeRatio(selectedAum, totalAum);

  return trend.map((point) => ({
    ...point,
    netNewMoneyChf: roundCurrency(point.netNewMoneyChf * scale),
  }));
};

const createSelectedRiskExposureTrend = (
  trend: RiskExposureTrendPoint[],
  selectedRows: AdvisoryWorklistRow[],
  allRows: AdvisoryWorklistRow[],
): RiskExposureTrendPoint[] => {
  const selectedLayers = createLayerTotals(selectedRows);
  const latestPoint = trend.at(-1);
  const latestStackTotal = latestPoint ? riskTrendStackTotal(latestPoint) : 0;
  const selectedFlow = sumBy(selectedRows, (row) => row.netFlow30dChf);
  const totalFlow = sumBy(allRows, (row) => row.netFlow30dChf);
  const selectedAum = sumBy(selectedRows, (row) => row.aumChf);
  const totalAum = sumBy(allRows, (row) => row.aumChf);
  const flowScale =
    totalFlow !== 0 ? selectedFlow / totalFlow : safeRatio(selectedAum, totalAum);

  return trend.map((point) => {
    const stackScale =
      latestStackTotal > 0 ? riskTrendStackTotal(point) / latestStackTotal : 1;
    return {
      ...point,
      highRiskAumChf: roundCurrency(selectedLayers.highRiskAumChf * stackScale),
      lowRiskAumChf: roundCurrency(selectedLayers.lowRiskAumChf * stackScale),
      mediumRiskAumChf: roundCurrency(
        selectedLayers.mediumRiskAumChf * stackScale,
      ),
      netNewMoneyChf: roundCurrency(point.netNewMoneyChf * flowScale),
      noRiskAumChf: roundCurrency(selectedLayers.noRiskAumChf * stackScale),
    };
  });
};

const createSelectedSegmentRiskScores = (
  scores: SegmentRiskScoreRow[],
  selectedRows: AdvisoryWorklistRow[],
  allRows: AdvisoryWorklistRow[],
  controls: WorkbenchControlState,
): SegmentRiskScoreRow[] => {
  const selectedAumBySegment = sumRowsBy(selectedRows, (row) => row.segment);
  const totalAumBySegment = sumRowsBy(allRows, (row) => row.segment);

  return scores.map((score) => {
    const selectedAum = selectedAumBySegment.get(score.segment) ?? 0;
    if (selectedAum <= 0) return { ...score, score: 0 };

    const share = safeRatio(selectedAum, totalAumBySegment.get(score.segment) ?? 0);
    const axisMultiplier =
      controls.riskCategory === "all"
        ? 1
        : riskAxisMatchesCategory(score.riskAxis, controls.riskCategory)
          ? 1.15
          : 0.25;
    const selectionMultiplier = 0.45 + 0.55 * Math.min(1, share);

    return {
      ...score,
      score: clampScore(score.score * selectionMultiplier * axisMultiplier),
    };
  });
};

const createSelectedRiskDriverExposure = (
  selectedRiskAccounts: TopRiskAccountRow[],
): RiskDriverExposureRow[] => {
  const exposureByDriver = new Map<string, number>();
  for (const risk of selectedRiskAccounts) {
    const driver = riskDriverFromIssue(risk.issue);
    exposureByDriver.set(
      driver,
      (exposureByDriver.get(driver) ?? 0) + risk.exposureChf,
    );
  }

  return riskDriverOrder
    .map((driver, index) => ({
      driver,
      exposureChf: exposureByDriver.get(driver) ?? 0,
      id: `selected-risk-driver-${index + 1}`,
    }))
    .filter((row) => row.exposureChf > 0);
};

const createLayerTotals = (rows: AdvisoryWorklistRow[]): RiskLayerTotals =>
  rows.reduce<RiskLayerTotals>(
    (current, row) => {
      if (row.priority === "High") current.highRiskAumChf += row.aumChf;
      else if (row.priority === "Medium") current.mediumRiskAumChf += row.aumChf;
      else if (row.priority === "Low") current.lowRiskAumChf += row.aumChf;
      else current.noRiskAumChf += row.aumChf;
      return current;
    },
    {
      highRiskAumChf: 0,
      lowRiskAumChf: 0,
      mediumRiskAumChf: 0,
      noRiskAumChf: 0,
    },
  );

const riskTrendStackTotal = (point: RiskExposureTrendPoint) =>
  point.highRiskAumChf +
  point.lowRiskAumChf +
  point.mediumRiskAumChf +
  point.noRiskAumChf;

const riskTextMatchesCategory = (
  value: string,
  category: WorkbenchRiskCategory,
) => {
  if (category === "all") return true;
  const normalized = value.toLowerCase();
  if (category === "liquidity") return normalized.includes("liquidity");
  if (category === "credit") return normalized.includes("credit");
  if (category === "margin") return normalized.includes("margin");
  if (category === "concentration") return normalized.includes("concentration");
  if (category === "covenant") return normalized.includes("covenant");
  return normalized.includes("collateral");
};

const dateMatchesDueWindow = (
  dueDate: string,
  controls: WorkbenchControlState,
  asOfDate: string,
) => {
  const range = createDueWindowRange(controls.dueWindow, asOfDate);
  if (!range) return true;
  const dueTime = parseDateOnly(dueDate);
  const fromTime = parseDateOnly(range[0]);
  const toTime = parseDateOnly(range[1]);
  if (dueTime === undefined || fromTime === undefined || toTime === undefined) {
    return false;
  }
  return dueTime >= fromTime && dueTime <= toTime;
};

const riskAxisMatchesCategory = (
  riskAxis: string,
  category: WorkbenchRiskCategory,
) => riskTextMatchesCategory(riskAxis, category);

const riskDriverFromIssue = (issue: string) => {
  const normalized = issue.toLowerCase();
  if (normalized.includes("liquidity")) return "Liquidity gap";
  if (normalized.includes("margin")) return "Margin pressure";
  if (normalized.includes("credit") || normalized.includes("concentration")) {
    return "Credit concentration";
  }
  if (normalized.includes("collateral")) return "Collateral shortfall";
  if (normalized.includes("market") || normalized.includes("commodity")) {
    return "Market volatility";
  }
  return "Other";
};

const isDefaultControlState = (controls: WorkbenchControlState) =>
  controls.viewQueue === defaultWorkbenchControlState.viewQueue &&
  controls.clientSegment === defaultWorkbenchControlState.clientSegment &&
  controls.priority === defaultWorkbenchControlState.priority &&
  controls.riskCategory === defaultWorkbenchControlState.riskCategory &&
  controls.dueStatus === defaultWorkbenchControlState.dueStatus &&
  controls.dueWindow === defaultWorkbenchControlState.dueWindow &&
  controls.rmAdvisor === defaultWorkbenchControlState.rmAdvisor &&
  controls.sortBy === defaultWorkbenchControlState.sortBy &&
  controls.quickFilters.length === 0;

const sumBy = <TItem>(
  items: readonly TItem[],
  selectValue: (item: TItem) => number,
) => items.reduce((total, item) => total + selectValue(item), 0);

const sumRowsBy = (
  rows: AdvisoryWorklistRow[],
  selectKey: (row: AdvisoryWorklistRow) => string,
) =>
  rows.reduce((current, row) => {
    const key = selectKey(row);
    current.set(key, (current.get(key) ?? 0) + row.aumChf);
    return current;
  }, new Map<string, number>());

const safeRatio = (part: number, total: number) => (total === 0 ? 0 : part / total);

const formatPercent = (part: number, total: number) =>
  total <= 0 ? 0 : Math.round((part / total) * 100);

const formatChf = (value: number) => {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return `CHF ${sign}${formatOneDecimal(absolute / 1_000_000_000)}B`;
  }
  if (absolute >= 1_000_000) {
    return `CHF ${sign}${Math.round(absolute / 1_000_000)}M`;
  }
  return `CHF ${sign}${Math.round(absolute).toLocaleString("en-US")}`;
};

const formatOneDecimal = (value: number) =>
  value.toFixed(1).replace(/\.0$/, "");

const roundCurrency = (value: number) => Math.round(value);

const clampScore = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

const parseDateOnly = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  const date = new Date(parsed);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};
