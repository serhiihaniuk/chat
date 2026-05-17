import type {
  WorkbenchCitationSource,
  WorkbenchQueryName,
} from "#ports/index.js";
import {
  isUnknownRecord,
  readString,
  type UnknownRecord,
} from "../../../shared/unknown-record.js";

const formatCitationLabel = (dataset: WorkbenchQueryName) => {
  switch (dataset) {
    case "dashboard_snapshot":
      return "Dashboard KPIs";
    case "client_portfolio_review":
      return "Client Portfolio Review";
    case "top_risk_accounts":
      return "Top Risk Accounts";
    case "product_allocation":
      return "Product Allocation";
    case "net_new_money_trend":
      return "Net New Money Trend";
  }
};

export const createWorkbenchSources = (
  query: WorkbenchQueryName,
  data: unknown,
): WorkbenchCitationSource[] => {
  if (query === "dashboard_snapshot") {
    const snapshot = data as { kpis?: unknown };
    if (Array.isArray(snapshot.kpis)) {
      return snapshot.kpis
        .map((kpi) => createKpiCitationSource(query, kpi))
        .filter((source): source is WorkbenchCitationSource => Boolean(source));
    }

    const kpis = snapshot.kpis as Record<string, unknown> | undefined;
    return Object.keys(kpis ?? {}).map((field) => ({
      sourceId: `dashboard_snapshot:${field}`,
      label: `${formatCitationLabel(query)} - ${field}`,
      dataset: query,
      field,
    }));
  }

  if (!Array.isArray(data)) return [];

  return data
    .map((row, index) => createRowCitationSource(query, row, index))
    .filter((source): source is WorkbenchCitationSource => Boolean(source));
};

const createKpiCitationSource = (
  query: WorkbenchQueryName,
  kpi: unknown,
): WorkbenchCitationSource | undefined => {
  if (!isUnknownRecord(kpi)) return undefined;

  const id = readString(kpi, "id");
  if (!id) return undefined;

  const label = readString(kpi, "label") ?? id;
  const field = id.replace(/^kpi-/, "").replace(/-([a-z])/g, (
    _match,
    letter: string,
  ) => letter.toUpperCase());

  return {
    sourceId: `dashboard_snapshot:${field}`,
    label: `${formatCitationLabel(query)} - ${label}`,
    dataset: query,
    rowId: id,
    field,
  };
};

const createRowCitationSource = (
  query: WorkbenchQueryName,
  row: unknown,
  index: number,
): WorkbenchCitationSource | undefined => {
  if (!isUnknownRecord(row)) return undefined;

  const rowNumber = index + 1;
  const rowId = readString(row, "id") ?? `row-${rowNumber}`;
  const labelValue = getCitationRowLabel(row, rowNumber);

  return {
    sourceId: `${query}:${rowId}`,
    label: `${formatCitationLabel(query)} - ${labelValue}`,
    dataset: query,
    rowId,
  };
};

const getCitationRowLabel = (
  row: UnknownRecord,
  rowNumber: number,
) =>
  readString(row, "client") ??
  readString(row, "assetClass") ??
  readString(row, "label") ??
  `Row ${rowNumber}`;
