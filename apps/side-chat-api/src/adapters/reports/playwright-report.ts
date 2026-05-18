import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type {
  WorkbenchReportPort,
  WorkbenchReportFocusName,
  WorkbenchReportNoteKind,
  WorkbenchReportSectionName,
} from "#ports/index.js";
import {
  isUnknownRecord,
  type UnknownRecord,
} from "../../shared/unknown-record.js";

/**
 * Report adapter boundary. The chat use case asks for a Workbench report; this
 * file owns HTML/PDF rendering and stores the generated artifact.
 */
export type GeneratedReportStore = {
  directory: string;
  publicBasePath: string;
};

const defaultSections: WorkbenchReportSectionName[] = [
  "kpis",
  "biggest_clients",
  "risk_accounts",
  "net_new_money_trend",
];

type KpiSummary = {
  totalAum: string;
  netNewMoney: string;
  advisoryCoverage: string;
  atRiskAccounts: string;
  complianceAlerts: string;
};

type RiskPortfolioRow = {
  client: string;
  issue: string;
  priority: string;
  exposureChf?: number;
  aumChf?: number;
  netFlow30dChf?: number;
  owner: string;
  dueDate: string;
  nextAction: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const sanitizeTitle = (value?: string) => {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 90) : "UBS Partner Workbench Briefing";
};

const sanitizeNote = (value?: string) => {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 700) : undefined;
};

const formatChf = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "n/a";
  if (Math.abs(numeric) >= 1_000_000_000)
    return `CHF ${(numeric / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(numeric) >= 1_000_000)
    return `CHF ${(numeric / 1_000_000).toFixed(0)}M`;
  return `CHF ${numeric.toLocaleString("en-US")}`;
};

const asRecord = (value: unknown): UnknownRecord =>
  isUnknownRecord(value) ? value : {};

const asArray = (value: unknown): UnknownRecord[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isUnknownRecord);
};

const renderList = (items: string[]) =>
  `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;

const asText = (value: unknown, fallback = "n/a") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const asNumber = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
};

export const createAnalystNoteParagraphs = (input: {
  noteKind?: WorkbenchReportNoteKind;
  note?: string;
  kpis: Record<string, unknown>;
  clients: Record<string, unknown>[];
  risks: Record<string, unknown>[];
  trend: Record<string, unknown>[];
}) => {
  const userNote = sanitizeNote(input.note);
  const noteKind = input.noteKind ?? "analyst_note";
  const biggestClient = input.clients[0];
  const topRisk = input.risks[0];
  const latestTrend = input.trend.at(-1);
  const watchClients = input.clients.filter(
    (client) => asText(client.coverageStatus, "") !== "Covered",
  );
  const paragraphs: string[] = [];

  if (noteKind === "risk_rationale") {
    paragraphs.push(
      `Risk rationale: outreach priority should start with ${asText(topRisk?.client, "the highest-priority risk row")} because the workbench flags ${asText(topRisk?.issue, "an active issue").toLowerCase()} with ${asText(topRisk?.priority, "elevated")} priority and ${formatChf(topRisk?.exposureChf)} exposure.`,
    );
  }

  if (noteKind === "next_action") {
    paragraphs.push(
      `Next action: ask the responsible RM to review ${asText(topRisk?.client, "the top risk account")}, confirm ${asText(topRisk?.issue, "the open risk issue").toLowerCase()}, and document the client follow-up before the due date. Use the watch-list coverage rows to sequence the remaining calls.`,
    );
  }

  if (noteKind === "analyst_note" && !userNote) {
    paragraphs.push(
      `Analyst note: the workbench shows ${asText(input.kpis.netNewMoney)} Net New Money and ${asText(input.kpis.atRiskAccounts)} at-risk accounts; prioritize covered high-AUM relationships while clearing high-priority risk rows.`,
    );
  }

  if (userNote) {
    paragraphs.push(formatUserNote(noteKind, userNote));
  }

  if (paragraphs.length === 0 && watchClients.length > 0) {
    paragraphs.push(
      `Analyst note: ${watchClients.length} reviewed client row(s) are not fully covered; confirm the next action owners before client outreach.`,
    );
  }

  return paragraphs;
};

const formatUserNote = (
  noteKind: WorkbenchReportNoteKind,
  userNote: string,
) => {
  if (noteKind === "custom") return userNote;
  return `Analyst emphasis: ${userNote}`;
};

const renderAnalystNote = (paragraphs: string[]) =>
  paragraphs.length
    ? `<section class="analyst-note"><h2>Analyst Note</h2>${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</section>`
    : "";

const normalizeKpis = (snapshot: UnknownRecord): KpiSummary => {
  const kpis = snapshot.kpis;
  if (Array.isArray(kpis)) {
    return {
      totalAum: findKpiValue(kpis, "Total AUM"),
      netNewMoney: findKpiValue(kpis, "Net New Money"),
      advisoryCoverage: findKpiValue(kpis, "Advisory Coverage"),
      atRiskAccounts: findKpiValue(kpis, "At-Risk Accounts"),
      complianceAlerts: findKpiValue(kpis, "Compliance Alerts"),
    };
  }

  const record = asRecord(kpis);
  return {
    totalAum: asText(record.totalAum),
    netNewMoney: asText(record.netNewMoney),
    advisoryCoverage: asText(record.advisoryCoverage),
    atRiskAccounts: asText(record.atRiskAccounts),
    complianceAlerts: asText(record.complianceAlerts),
  };
};

const findKpiValue = (items: unknown[], label: string) => {
  const match = items.map(asRecord).find((item) => item.label === label);
  return asText(match?.value);
};

const createRiskPortfolioRows = (
  risks: UnknownRecord[],
  clients: UnknownRecord[],
): RiskPortfolioRow[] => {
  const clientsById = new Map(
    clients
      .map((client) => [asText(client.clientId, ""), client] as const)
      .filter(([clientId]) => clientId),
  );
  const clientsByName = new Map(
    clients
      .map((client) => [asText(client.client, ""), client] as const)
      .filter(([clientName]) => clientName),
  );

  return risks
    .map((risk) => {
      const client =
        clientsById.get(asText(risk.clientId, "")) ??
        clientsByName.get(asText(risk.client, ""));
      return {
        client: asText(risk.client),
        issue: asText(risk.issue),
        priority: asText(risk.priority),
        exposureChf: asNumber(risk.exposureChf),
        aumChf: asNumber(client?.aumChf),
        netFlow30dChf: asNumber(client?.netFlow30dChf),
        owner: asText(risk.owner ?? client?.relationshipManager),
        dueDate: asText(risk.dueDate),
        nextAction: asText(client?.nextAction, "Confirm RM follow-up"),
      };
    })
    .sort(compareRiskPortfolioRows);
};

const compareRiskPortfolioRows = (
  left: RiskPortfolioRow,
  right: RiskPortfolioRow,
) =>
  priorityRank(left.priority) - priorityRank(right.priority) ||
  (right.exposureChf ?? 0) - (left.exposureChf ?? 0) ||
  (right.aumChf ?? 0) - (left.aumChf ?? 0);

const priorityRank = (priority: string) => {
  if (priority === "High") return 0;
  if (priority === "Medium") return 1;
  if (priority === "Low") return 2;
  return 3;
};

const sumNumbers = <TItem,>(
  items: TItem[],
  selectValue: (item: TItem) => number | undefined,
) => items.reduce((total, item) => total + (selectValue(item) ?? 0), 0);

const formatSignedChf = (value: unknown) => {
  const numeric = asNumber(value);
  if (numeric === undefined) return "n/a";
  if (numeric < 0) return `(${formatChf(Math.abs(numeric)).replace("CHF ", "")})`;
  return formatChf(numeric).replace("CHF ", "");
};

const renderSection = (
  section: WorkbenchReportSectionName,
  sections: WorkbenchReportSectionName[],
  html: string,
) => (sections.includes(section) ? html : "");

const priorityClass = (priority: string) => {
  if (priority === "High") return "priority-high";
  if (priority === "Medium") return "priority-medium";
  return "";
};

const formatReportFocus = (focus: WorkbenchReportFocusName | undefined) => {
  if (focus === "risk_review") return "Risk review";
  if (focus === "client_coverage") return "Client coverage";
  if (focus === "portfolio_allocation") return "Portfolio allocation";
  return "Executive summary";
};

export const createReportHtml = (input: {
  title: string;
  focus?: WorkbenchReportFocusName;
  sections: WorkbenchReportSectionName[];
  noteKind?: WorkbenchReportNoteKind;
  note?: string;
  generatedAt: string;
  snapshot: unknown;
  clients: unknown;
  risks: unknown;
  allocation: unknown;
  trend: unknown;
}) => {
  const snapshot = asRecord(input.snapshot);
  const kpis = normalizeKpis(snapshot);
  const allClients = asArray(input.clients);
  const clients = [...allClients]
    .sort(
      (left, right) =>
        (asNumber(right.aumChf) ?? 0) - (asNumber(left.aumChf) ?? 0),
    )
    .slice(0, 5);
  const riskPortfolios = createRiskPortfolioRows(asArray(input.risks), allClients);
  const risks = riskPortfolios.slice(0, 8);
  const allocation = asArray(input.allocation).slice(0, 5);
  const trend = asArray(input.trend).slice(-3);
  const topRisk = risks[0];
  const totalTopRiskExposure = sumNumbers(risks, (risk) => risk.exposureChf);
  const highPriorityCount = risks.filter((risk) => risk.priority === "High").length;
  const latestTrend = trend.at(-1);
  const analystNoteParagraphs = createAnalystNoteParagraphs({
    noteKind: input.noteKind,
    note: input.note,
    kpis,
    clients,
    risks,
    trend,
  });
  const focusLabel = formatReportFocus(input.focus);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 24px; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: white; }
    header { border-bottom: 2px solid #e30613; padding-bottom: 12px; margin-bottom: 16px; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; }
    h1 { margin: 5px 0 6px; font-size: 25px; font-weight: 700; }
    .meta { font-size: 12px; color: #6b7280; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
    .card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
    .label { font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; }
    .value { margin-top: 4px; font-size: 18px; font-weight: 700; }
    section { margin-top: 14px; break-inside: avoid; }
    h2 { margin: 0 0 8px; font-size: 15px; }
    p, li { font-size: 12px; line-height: 1.45; }
    ul { margin: 6px 0 0 18px; padding: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; color: #6b7280; font-weight: 700; border-bottom: 1px solid #e5e7eb; padding: 6px 4px; }
    td { border-bottom: 1px solid #f1f5f9; padding: 6px 4px; }
    .negative { color: #dc2626; }
    .priority-high { color: #dc2626; font-weight: 700; }
    .priority-medium { color: #d97706; font-weight: 700; }
    .analyst-note { border-left: 3px solid #e30613; padding: 2px 0 2px 10px; color: #374151; }
    .analyst-note h2 { color: #111827; }
    .analyst-note p { margin: 5px 0; }
    footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">UBS Partner / Advisory Workbench</div>
    <h1>${escapeHtml(input.title)}</h1>
    <div class="meta">Generated ${escapeHtml(input.generatedAt)} | ${escapeHtml(focusLabel)} | Data-backed briefing</div>
  </header>
  <div class="grid">
    <div class="card"><div class="label">Total AUM</div><div class="value">${escapeHtml(kpis.totalAum)}</div></div>
    <div class="card"><div class="label">Net New Money</div><div class="value">${escapeHtml(kpis.netNewMoney)}</div></div>
    <div class="card"><div class="label">At-Risk Accounts</div><div class="value">${escapeHtml(kpis.atRiskAccounts)}</div></div>
    <div class="card"><div class="label">Top Risk Exposure</div><div class="value">${escapeHtml(formatChf(totalTopRiskExposure))}</div></div>
  </div>
  ${renderAnalystNote(analystNoteParagraphs)}
  ${renderSection("kpis", input.sections, `<section>
    <h2>Executive Risk Signals</h2>
    ${renderList([
      topRisk
        ? `Primary risk portfolio: ${topRisk.client}, ${topRisk.issue.toLowerCase()}, ${formatChf(topRisk.exposureChf)} exposure.`
        : "Primary risk portfolio: n/a",
      `${highPriorityCount} high-priority risk portfolio(s) in the report sample.`,
      `Advisory coverage: ${kpis.advisoryCoverage}; compliance alerts: ${kpis.complianceAlerts}.`,
      latestTrend
        ? `Latest Net New Money point: ${String(latestTrend.label)} at ${formatChf(latestTrend.netNewMoneyChf)}.`
        : "Latest Net New Money point: n/a.",
    ])}
  </section>`)}
  ${renderSection("risk_accounts", input.sections, `<section>
    <h2>Top Risk Portfolios</h2>
    <table>
      <thead><tr><th>Client</th><th>Issue</th><th>Priority</th><th>Exposure</th><th>AUM</th><th>30D Flow</th><th>Owner</th><th>Due</th></tr></thead>
      <tbody>
        ${risks
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.client)}</td><td>${escapeHtml(row.issue)}</td><td class="${priorityClass(row.priority)}">${escapeHtml(row.priority)}</td><td>${escapeHtml(formatChf(row.exposureChf))}</td><td>${escapeHtml(formatChf(row.aumChf))}</td><td class="${(row.netFlow30dChf ?? 0) < 0 ? "negative" : ""}">${escapeHtml(formatSignedChf(row.netFlow30dChf))}</td><td>${escapeHtml(row.owner)}</td><td>${escapeHtml(row.dueDate)}</td></tr>`,
          )
          .join("") || `<tr><td colspan="8">No risk portfolios found.</td></tr>`}
      </tbody>
    </table>
  </section>`)}
  ${renderSection("biggest_clients", input.sections, `<section>
    <h2>Top Client Portfolio Rows</h2>
    <table>
      <thead><tr><th>Client</th><th>Segment</th><th>AUM</th><th>Status</th><th>Next Action</th></tr></thead>
      <tbody>
        ${clients
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.client)}</td><td>${escapeHtml(row.segment)}</td><td>${escapeHtml(formatChf(row.aumChf))}</td><td>${escapeHtml(row.coverageStatus)}</td><td>${escapeHtml(row.nextAction)}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </section>`)}
  ${renderSection("product_allocation", input.sections, `<section>
    <h2>Product Allocation Notes</h2>
    ${renderList([
      ...allocation.map(
        (row) =>
          `${String(row.assetClass)} allocation: current ${String(row.currentPercent)}%, target ${String(row.targetPercent)}%`,
      ),
    ])}
  </section>`)}
  ${renderSection("net_new_money_trend", input.sections, `<section>
    <h2>Net New Money Trend</h2>
    ${renderList(
      trend.map(
        (row) => `${String(row.label)}: ${formatChf(row.netNewMoneyChf)}`,
      ),
    )}
  </section>`)}
  <footer><span>Generated by Workspace Assistant</span><span>Page 1 of 1</span></footer>
</body>
</html>`;
};

export const createPlaywrightWorkbenchReportPort = (
  store: GeneratedReportStore,
): WorkbenchReportPort => ({
  async generate({ workspaceId, report, workbenchTools }) {
    const title = sanitizeTitle(report.title);
    const sections = report.sections?.length ? report.sections : defaultSections;
    const generatedAt = new Date().toISOString().slice(0, 10);
    const [snapshot, clients, risks, allocation, trend] = await Promise.all([
      workbenchTools.query({
        workspaceId,
        userId: "report-generator",
        query: { query: "dashboard_snapshot" },
      }),
      workbenchTools.query({
        workspaceId,
        userId: "report-generator",
        query: { query: "client_portfolio_review" },
      }),
      workbenchTools.query({
        workspaceId,
        userId: "report-generator",
        query: { query: "top_risk_accounts" },
      }),
      workbenchTools.query({
        workspaceId,
        userId: "report-generator",
        query: { query: "product_allocation" },
      }),
      workbenchTools.query({
        workspaceId,
        userId: "report-generator",
        query: { query: "net_new_money_trend" },
      }),
    ]);

    await mkdir(store.directory, { recursive: true });
    const reportId = randomUUID();
    const fileName = `${reportId}.pdf`;
    const filePath = path.join(store.directory, fileName);
    const html = createReportHtml({
      title,
      focus: report.focus,
      sections,
      noteKind: report.noteKind,
      note: sanitizeNote(report.note),
      generatedAt,
      snapshot: snapshot.data,
      clients: clients.data,
      risks: risks.data,
      allocation: allocation.data,
      trend: trend.data,
    });

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.pdf({
        path: filePath,
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
    } finally {
      await browser.close();
    }

    return {
      reportId,
      fileName,
      reportUrl: `${store.publicBasePath}/${fileName}`,
      title,
      pages: 1,
      sections,
    };
  },
});

export const readGeneratedReport = async (
  store: GeneratedReportStore,
  fileName: string,
) => {
  if (!/^[0-9a-f-]+\.pdf$/i.test(fileName)) return undefined;
  return readFile(path.join(store.directory, fileName));
};
