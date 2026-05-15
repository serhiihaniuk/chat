import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type {
  WorkbenchReportPort,
  WorkbenchReportSectionName,
} from "../../ports/index.js";

export type GeneratedReportStore = {
  directory: string;
  publicBasePath: string;
};

const defaultSections: WorkbenchReportSectionName[] = [
  "kpis",
  "biggest_clients",
  "risk_accounts",
];

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
  return trimmed ? trimmed.slice(0, 220) : undefined;
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

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          entry !== null && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];

const renderList = (items: string[]) =>
  `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;

const createReportHtml = (input: {
  title: string;
  note?: string;
  generatedAt: string;
  snapshot: unknown;
  clients: unknown;
  risks: unknown;
  allocation: unknown;
  trend: unknown;
}) => {
  const snapshot = asRecord(input.snapshot);
  const kpis = asRecord(snapshot.kpis);
  const clients = asArray(input.clients).slice(0, 5);
  const risks = asArray(input.risks).slice(0, 4);
  const allocation = asArray(input.allocation).slice(0, 5);
  const trend = asArray(input.trend).slice(-3);
  const biggestClient = clients[0];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 24px; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: white; }
    header { border-bottom: 2px solid #e30613; padding-bottom: 12px; margin-bottom: 18px; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; }
    h1 { margin: 5px 0 6px; font-size: 25px; font-weight: 700; }
    .meta { font-size: 12px; color: #6b7280; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
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
    .note { border-left: 3px solid #e30613; padding-left: 10px; color: #374151; }
    footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">UBS Partner / Advisory Workbench</div>
    <h1>${escapeHtml(input.title)}</h1>
    <div class="meta">Generated ${escapeHtml(input.generatedAt)} · One-page briefing</div>
  </header>
  <div class="grid">
    <div class="card"><div class="label">Total AUM</div><div class="value">${escapeHtml(kpis.totalAum)}</div></div>
    <div class="card"><div class="label">Net New Money</div><div class="value">${escapeHtml(kpis.netNewMoney)}</div></div>
    <div class="card"><div class="label">At-Risk Accounts</div><div class="value">${escapeHtml(kpis.atRiskAccounts)}</div></div>
  </div>
  ${
    input.note
      ? `<section><p class="note">${escapeHtml(input.note)}</p></section>`
      : ""
  }
  <section>
    <h2>Client Coverage Snapshot</h2>
    ${renderList([
      biggestClient
        ? `Largest client by AUM: ${biggestClient.client} (${formatChf(biggestClient.aumChf)})`
        : "Largest client by AUM: n/a",
      `Advisory coverage: ${String(kpis.advisoryCoverage ?? "n/a")}`,
      `Compliance alerts: ${String(kpis.complianceAlerts ?? "n/a")}`,
    ])}
  </section>
  <section>
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
  </section>
  <section>
    <h2>Risk And Allocation Notes</h2>
    ${renderList([
      ...risks.map(
        (row) =>
          `${String(row.client)}: ${String(row.issue)} (${String(row.priority)})`,
      ),
      ...allocation.slice(0, 2).map(
        (row) =>
          `${String(row.assetClass)} allocation: current ${String(row.currentPercent)}%, target ${String(row.targetPercent)}%`,
      ),
      ...trend.slice(-1).map(
        (row) => `Latest net-new-money point: ${String(row.label)} at ${formatChf(row.netNewMoneyChf)}`,
      ),
    ])}
  </section>
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
