import { useMemo, useState, type MouseEventHandler } from "react";
import { Info } from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  AdvisoryDashboardSnapshot,
  AdvisoryKpi,
  RiskDriverExposureRow,
  RiskExposureTrendPoint,
  SegmentRiskScoreRow,
} from "../model/advisory-dashboard.types.js";
import {
  createWorklistRows,
  type AdvisoryWorklistRow,
} from "../model/worklist-model.js";
import { formatChfCompact } from "./formatters.js";

type WorkbenchAnalyticsProps = {
  snapshot: AdvisoryDashboardSnapshot;
};

type RiskLayerDatum = {
  date: string;
  eventLabel: string | null;
  noRiskB: number;
  lowB: number;
  mediumB: number;
  highB: number;
  netNewMoneyB: number;
};

type RiskSummaryRow = {
  label: "High" | "Medium" | "Low" | "No risk";
  aumChf: number;
  count: number;
  percent: number;
  className: "high" | "medium" | "low" | "no-risk";
};

type RadarDatum = {
  axis: string;
  corporate: number;
  uhnw: number;
  institutional: number;
};

type MomentumDatum = {
  id: string;
  fill: string;
  isFinal: boolean;
  label: string;
  valueB: number;
};

type RiskDriverClassName =
  | "liquidity"
  | "margin"
  | "credit"
  | "collateral"
  | "market"
  | "other"
  | "total";

type WaterfallDatum = {
  baseB: number;
  className: RiskDriverClassName;
  driver: string;
  label: string;
  valueB: number;
  valueLabel: string;
};

type WaterfallTooltipDatum = WaterfallDatum & {
  totalB: number;
};

type RadarTooltipPayload = {
  color?: string;
  name?: string;
  value?: number;
};

type MomentumTooltipPayload = {
  payload?: MomentumDatum;
};

type WaterfallTooltipPayload = {
  payload?: WaterfallTooltipDatum;
};

type PieTooltipPayload = {
  payload?: RiskSummaryRow;
};

type RechartsTooltipProps<TPayload> = {
  active?: boolean;
  payload?: TPayload[];
};

type WaterfallLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: boolean | null | number | string;
};

type WaterfallChartData = {
  items: WaterfallTooltipDatum[];
  maxB: number;
  ticks: number[];
  totalLabel: string;
};

type TooltipPayload<TPayload> = {
  payload?: TPayload;
};

type ChartTooltipProps<TPayload> = {
  active?: boolean;
  payload?: TooltipPayload<TPayload>[];
};

type CursorTooltipPosition = {
  x: number;
  y: number;
};

const riskLayerKeys = [
  { key: "noRiskB", label: "No risk", className: "no-risk" },
  { key: "lowB", label: "Low", className: "low" },
  { key: "mediumB", label: "Medium", className: "medium" },
  { key: "highB", label: "High", className: "high" },
] as const;

const compositionColors: Record<RiskSummaryRow["className"], string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#14b8a6",
  "no-risk": "#10b981",
};

const waterfallColors: Record<RiskDriverClassName, string> = {
  liquidity: "#ef4444",
  margin: "#f59e0b",
  credit: "#fbbf24",
  collateral: "#10b981",
  market: "#0b3a82",
  other: "#94a3b8",
  total: "#475569",
};

const tooltipEscapeViewBox = { x: true, y: true };
const tooltipWrapperStyle = { pointerEvents: "none" } as const;
const cursorTooltipOffset = 14;
const cursorTooltipSize = {
  width: 230,
  height: 160,
};

const useCursorTooltipPosition = () => {
  const [position, setPosition] = useState<CursorTooltipPosition>();

  const onMouseMove: MouseEventHandler<HTMLDivElement> = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const hasViewportSpaceRight =
      window.innerWidth - event.clientX >
      cursorTooltipSize.width + cursorTooltipOffset;
    const hasViewportSpaceBelow =
      window.innerHeight - event.clientY >
      cursorTooltipSize.height + cursorTooltipOffset;

    const x = hasViewportSpaceRight
      ? localX + cursorTooltipOffset
      : localX - cursorTooltipSize.width - cursorTooltipOffset;
    const y = hasViewportSpaceBelow
      ? localY + cursorTooltipOffset
      : localY - cursorTooltipSize.height - cursorTooltipOffset;

    setPosition({
      x: Math.max(8 - rect.left, x),
      y: Math.max(8 - rect.top, y),
    });
  };

  const onMouseLeave = () => setPosition(undefined);

  return { onMouseLeave, onMouseMove, position };
};

export function RiskIntelligenceOverview({
  snapshot,
}: WorkbenchAnalyticsProps) {
  const tooltipPosition = useCursorTooltipPosition();
  const chartData = useMemo(
    () => createRiskLayerSeries(snapshot.riskExposureTrend),
    [snapshot.riskExposureTrend],
  );
  const aumAxis = useMemo(() => createAumAxis(chartData), [chartData]);
  const kpis = createInlineKpis(snapshot.kpis);
  const xTicks = useMemo(() => createXAxisTicks(chartData), [chartData]);

  return (
    <section className="analytics-card risk-overview-card">
      <div className="risk-overview-header">
        <div className="risk-overview-title">
          <h2>Risk Intelligence Overview</h2>
          <p>AUM exposure by risk level with net new money momentum.</p>
        </div>
        <div className="inline-kpi-strip">
          {kpis.map((kpi) => (
            <div className="inline-kpi" key={kpi.label}>
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
              <small className={kpi.tone}>{kpi.delta}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="risk-chart-legend">
        {riskLayerKeys.map((item) => (
          <span key={item.key}>
            <i className={item.className} />
            {item.label}
          </span>
        ))}
        <span>
          <i className="net-new-money" />
          Net New Money (CHF)
        </span>
      </div>

      <div
        className="risk-layer-chart-shell"
        onMouseLeave={tooltipPosition.onMouseLeave}
        onMouseMove={tooltipPosition.onMouseMove}
      >
        <ResponsiveContainer
          height="100%"
          initialDimension={{ height: 300, width: 980 }}
          width="100%"
        >
          <ComposedChart
            data={chartData}
            margin={{ bottom: 6, left: 0, right: 4, top: 30 }}
          >
            <defs>
              <linearGradient id="noRiskGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.72} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.24} />
              </linearGradient>
              <linearGradient id="lowRiskGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#5eead4" stopOpacity={0.72} />
                <stop offset="100%" stopColor="#5eead4" stopOpacity={0.24} />
              </linearGradient>
              <linearGradient
                id="mediumRiskGradient"
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.68} />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.22} />
              </linearGradient>
              <linearGradient id="highRiskGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.66} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.22} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef2f7" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="date"
              minTickGap={18}
              tickLine={false}
              ticks={xTicks}
            />
            <YAxis
              axisLine={false}
              domain={[0, aumAxis.max]}
              label={{
                value: "AUM (CHF)",
                angle: 0,
                position: "insideTopLeft",
                offset: 0,
              }}
              tickFormatter={(value) => (value === 0 ? "0" : `${value}B`)}
              tickLine={false}
              ticks={aumAxis.ticks}
              width={54}
              yAxisId="aum"
            />
            <YAxis
              axisLine={false}
              domain={[-1.5, 1.5]}
              label={{
                value: "Net New Money (CHF)",
                angle: 0,
                position: "insideTopRight",
                offset: 0,
              }}
              orientation="right"
              tickFormatter={(value) =>
                value === 0 ? "0" : `${Number(value).toFixed(1)}B`
              }
              tickLine={false}
              ticks={[-1.5, -0.75, 0, 0.75, 1.5]}
              width={60}
              yAxisId="money"
            />
            <Tooltip
              allowEscapeViewBox={tooltipEscapeViewBox}
              content={<RiskLayerTooltip />}
              cursor={false}
              isAnimationActive={false}
              offset={0}
              position={tooltipPosition.position}
              wrapperStyle={tooltipWrapperStyle}
            />
            {chartData
              .filter((point) => point.eventLabel)
              .map((event) => (
              <ReferenceLine
                ifOverflow="extendDomain"
                key={event.date}
                label={{
                  value: `${event.date}\n${event.eventLabel ?? ""}`,
                  position: "insideTop",
                  className: "event-marker-label",
                }}
                stroke="#94a3b8"
                strokeDasharray="5 6"
                x={event.date}
                yAxisId="aum"
              />
            ))}
            <Area
              dataKey="noRiskB"
              fill="url(#noRiskGradient)"
              fillOpacity={1}
              isAnimationActive={false}
              name="No risk"
              stackId="risk"
              stroke="#059669"
              strokeOpacity={0.52}
              strokeWidth={1}
              type="monotone"
              yAxisId="aum"
            />
            <Area
              dataKey="lowB"
              fill="url(#lowRiskGradient)"
              fillOpacity={1}
              isAnimationActive={false}
              name="Low"
              stackId="risk"
              stroke="#14b8a6"
              strokeOpacity={0.52}
              strokeWidth={1}
              type="monotone"
              yAxisId="aum"
            />
            <Area
              dataKey="mediumB"
              fill="url(#mediumRiskGradient)"
              fillOpacity={1}
              isAnimationActive={false}
              name="Medium"
              stackId="risk"
              stroke="#f59e0b"
              strokeOpacity={0.48}
              strokeWidth={1}
              type="monotone"
              yAxisId="aum"
            />
            <Area
              dataKey="highB"
              fill="url(#highRiskGradient)"
              fillOpacity={1}
              isAnimationActive={false}
              name="High"
              stackId="risk"
              stroke="#ef4444"
              strokeOpacity={0.5}
              strokeWidth={1}
              type="monotone"
              yAxisId="aum"
            />
            <Line
              activeDot={{
                fill: "#0b3a82",
                r: 5,
                stroke: "#ffffff",
                strokeWidth: 2,
              }}
              dataKey="netNewMoneyB"
              dot={{
                fill: "#0b3a82",
                r: 3,
                stroke: "#ffffff",
                strokeWidth: 1.5,
              }}
              isAnimationActive={false}
              name="Net New Money"
              stroke="#0b3a82"
              strokeWidth={2.8}
              type="monotone"
              yAxisId="money"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function RiskIntelligenceRail({ snapshot }: WorkbenchAnalyticsProps) {
  const compositionTooltipPosition = useCursorTooltipPosition();
  const momentumTooltipPosition = useCursorTooltipPosition();
  const radarTooltipPosition = useCursorTooltipPosition();
  const waterfallTooltipPosition = useCursorTooltipPosition();
  const rows = useMemo(() => createWorklistRows(snapshot), [snapshot]);
  const riskRows = useMemo(() => createRiskSummaryRows(rows), [rows]);
  const radarData = useMemo(
    () => createRadarData(snapshot.segmentRiskScores),
    [snapshot.segmentRiskScores],
  );
  const totalAumLabel = findKpi(snapshot.kpis, "Total AUM")?.value ?? "CHF 24.8B";
  const momentumData = useMemo(
    () => createMomentumChartData(snapshot.netNewMoneyTrend),
    [snapshot.netNewMoneyTrend],
  );
  const waterfall = useMemo(
    () => createWaterfallData(snapshot.riskDriverExposure),
    [snapshot.riskDriverExposure],
  );

  return (
    <aside className="risk-intelligence-rail" aria-label="Risk intelligence">
      <section className="analytics-card risk-composition-card">
        <div className="rail-card-title-row">
          <h2>Risk Composition</h2>
          <Info size={17} aria-hidden="true" />
        </div>
        <div className="risk-composition-body">
          <div
            className="risk-donut-shell"
            onMouseLeave={compositionTooltipPosition.onMouseLeave}
            onMouseMove={compositionTooltipPosition.onMouseMove}
          >
            <ResponsiveContainer
              height="100%"
              initialDimension={{ height: 240, width: 240 }}
              width="100%"
            >
              <PieChart>
                <Tooltip
                  allowEscapeViewBox={tooltipEscapeViewBox}
                  content={<RiskCompositionTooltip />}
                  cursor={false}
                  isAnimationActive={false}
                  offset={0}
                  position={compositionTooltipPosition.position}
                  wrapperStyle={tooltipWrapperStyle}
                />
                <Pie
                  data={riskRows}
                  dataKey="aumChf"
                  innerRadius="64%"
                  isAnimationActive={false}
                  nameKey="label"
                  outerRadius="90%"
                  paddingAngle={2}
                  stroke="#ffffff"
                  strokeWidth={3}
                >
                  {riskRows.map((item) => (
                    <Cell
                      fill={compositionColors[item.className]}
                      key={item.label}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="risk-donut-center">
              <strong>{totalAumLabel}</strong>
              <span>Total AUM</span>
            </div>
          </div>
        </div>
        <div className="money-momentum-panel">
          <div className="rail-subtitle-row">
            <h3>Money Momentum</h3>
            <span>vs prior month</span>
          </div>
          <div className="momentum-axis-row">
            <span className="negative">{formatSignedB(minMomentumValue(momentumData))}</span>
            <span className="positive">{formatSignedB(lastMomentumValue(momentumData))}</span>
          </div>
          <div
            className="momentum-chart-shell"
            onMouseLeave={momentumTooltipPosition.onMouseLeave}
            onMouseMove={momentumTooltipPosition.onMouseMove}
          >
            <ResponsiveContainer
              height="100%"
              initialDimension={{ height: 58, width: 420 }}
              width="100%"
            >
              <BarChart
                data={momentumData}
                margin={{ bottom: 0, left: 0, right: 0, top: 10 }}
              >
                <XAxis dataKey="label" hide />
                <YAxis
                  domain={createMomentumDomain(momentumData)}
                  hide
                  type="number"
                />
                <Tooltip
                  allowEscapeViewBox={tooltipEscapeViewBox}
                  content={<MomentumTooltip />}
                  cursor={false}
                  isAnimationActive={false}
                  offset={0}
                  position={momentumTooltipPosition.position}
                  wrapperStyle={tooltipWrapperStyle}
                />
                <ReferenceLine stroke="#e5e7eb" y={0} />
                <Bar
                  dataKey="valueB"
                  isAnimationActive={false}
                  radius={[0, 0, 0, 0]}
                >
                  {momentumData.map((bar) => (
                    <Cell fill={bar.fill} key={bar.id} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="analytics-card segment-radar-card">
        <div className="rail-card-title-row">
          <div>
            <h2>Segment Risk Radar</h2>
          </div>
          <Info size={17} aria-hidden="true" />
        </div>
        <div className="radar-legend">
          <span>
            <i className="corporate" />
            Corporate
          </span>
          <span>
            <i className="uhnw" />
            UHNW
          </span>
          <span>
            <i className="institutional" />
            Institutional
          </span>
        </div>
        <div className="radar-card-body">
          <div
            className="radar-chart-shell"
            onMouseLeave={radarTooltipPosition.onMouseLeave}
            onMouseMove={radarTooltipPosition.onMouseMove}
          >
            <ResponsiveContainer
              height="100%"
              initialDimension={{ height: 190, width: 320 }}
              width="100%"
            >
              <RadarChart data={radarData} outerRadius="78%">
                <PolarGrid gridType="polygon" stroke="#e5e7eb" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: "#334155", fontSize: 11, fontWeight: 650 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  tickCount={5}
                />
                <Tooltip
                  allowEscapeViewBox={tooltipEscapeViewBox}
                  content={<RadarTooltip />}
                  cursor={false}
                  isAnimationActive={false}
                  offset={0}
                  position={radarTooltipPosition.position}
                  wrapperStyle={tooltipWrapperStyle}
                />
                <Radar
                  name="Corporate"
                  dataKey="corporate"
                  fill="#0b3a82"
                  fillOpacity={0.16}
                  isAnimationActive={false}
                  stroke="#0b3a82"
                  strokeWidth={2}
                />
                <Radar
                  name="UHNW"
                  dataKey="uhnw"
                  fill="#10b981"
                  fillOpacity={0.16}
                  isAnimationActive={false}
                  stroke="#10b981"
                  strokeWidth={2}
                />
                <Radar
                  name="Institutional"
                  dataKey="institutional"
                  fill="#f59e0b"
                  fillOpacity={0.14}
                  isAnimationActive={false}
                  stroke="#f59e0b"
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="risk-scale-note">
            <strong>Scale</strong>
            <span>0 = Low risk</span>
            <span>100 = High risk</span>
          </div>
        </div>
      </section>

      <section className="analytics-card waterfall-card">
        <div className="rail-card-title-row waterfall-heading">
          <div>
            <h2>Risk Impact Waterfall</h2>
            <p>Contribution to total at-risk AUM</p>
          </div>
          <Info size={17} aria-hidden="true" />
        </div>
        <div className="waterfall-body">
          <div
            className="waterfall-chart-shell"
            onMouseLeave={waterfallTooltipPosition.onMouseLeave}
            onMouseMove={waterfallTooltipPosition.onMouseMove}
          >
            <ResponsiveContainer
              height="100%"
              initialDimension={{ height: 180, width: 500 }}
              width="100%"
            >
              <BarChart
                data={waterfall.items}
                margin={{ bottom: 6, left: 0, right: 4, top: 20 }}
              >
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis
                  axisLine={{ stroke: "#cbd5e1" }}
                  dataKey="label"
                  interval={0}
                  tick={{ fill: "#334155", fontSize: 10, fontWeight: 700 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  domain={[0, waterfall.maxB]}
                  tick={{ fill: "#64748b", fontSize: 10, fontWeight: 700 }}
                  tickFormatter={(value) => `${Number(value).toFixed(0)}B`}
                  tickLine={false}
                  ticks={waterfall.ticks}
                  width={34}
                />
                <Tooltip
                  allowEscapeViewBox={tooltipEscapeViewBox}
                  content={<WaterfallTooltip />}
                  cursor={false}
                  isAnimationActive={false}
                  offset={0}
                  position={waterfallTooltipPosition.position}
                  wrapperStyle={tooltipWrapperStyle}
                />
                <Bar
                  dataKey="baseB"
                  fill="transparent"
                  isAnimationActive={false}
                  stackId="waterfall"
                />
                <Bar
                  dataKey="valueB"
                  isAnimationActive={false}
                  stackId="waterfall"
                >
                  <LabelList content={renderWaterfallLabel} dataKey="valueLabel" />
                  {waterfall.items.map((item) => (
                    <Cell
                      fill={waterfallColors[item.className]}
                      key={item.driver}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="waterfall-footer">
          <span>Total at-risk AUM</span>
          <strong>{waterfall.totalLabel}</strong>
        </div>
      </section>
    </aside>
  );
}

const RiskLayerTooltip = ({
  active,
  payload,
}: ChartTooltipProps<RiskLayerDatum>) => {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="chart-tooltip">
      <strong>{item.date}</strong>
      <span>Risk-adjusted AUM layers</span>
      <dl>
        <div>
          <dt>No risk</dt>
          <dd>CHF {item.noRiskB.toFixed(1)}B</dd>
        </div>
        <div>
          <dt>Low</dt>
          <dd>CHF {item.lowB.toFixed(1)}B</dd>
        </div>
        <div>
          <dt>Medium</dt>
          <dd>CHF {item.mediumB.toFixed(1)}B</dd>
        </div>
        <div>
          <dt>High</dt>
          <dd>CHF {item.highB.toFixed(1)}B</dd>
        </div>
        <div>
          <dt>Net New Money</dt>
          <dd>CHF {item.netNewMoneyB.toFixed(2)}B</dd>
        </div>
      </dl>
    </div>
  );
};

const RiskCompositionTooltip = ({
  active,
  payload,
}: RechartsTooltipProps<PieTooltipPayload>) => {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="chart-tooltip compact-tooltip">
      <strong>{item.label}</strong>
      <span>{formatChfCompact(item.aumChf)} exposure</span>
      <dl>
        <div>
          <dt>Accounts</dt>
          <dd>{item.count}</dd>
        </div>
        <div>
          <dt>Mix</dt>
          <dd>{item.percent}%</dd>
        </div>
      </dl>
    </div>
  );
};

const MomentumTooltip = ({
  active,
  payload,
}: RechartsTooltipProps<MomentumTooltipPayload>) => {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="chart-tooltip compact-tooltip">
      <strong>{item.label}</strong>
      <span>Net New Money</span>
      <dl>
        <div>
          <dt>CHF</dt>
          <dd>{formatSignedB(item.valueB)}</dd>
        </div>
      </dl>
    </div>
  );
};

const RadarTooltip = ({
  active,
  payload,
}: RechartsTooltipProps<RadarTooltipPayload>) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip compact-tooltip">
      <strong>Segment risk score</strong>
      <span>0 = low risk, 100 = high risk</span>
      <dl>
        {payload.map((item) => (
          <div key={item.name}>
            <dt>{item.name}</dt>
            <dd>{Math.round(item.value ?? 0)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

const WaterfallTooltip = ({
  active,
  payload,
}: RechartsTooltipProps<WaterfallTooltipPayload>) => {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="chart-tooltip compact-tooltip">
      <strong>{item.driver}</strong>
      <span>Contribution to at-risk AUM</span>
      <dl>
        <div>
          <dt>Exposure</dt>
          <dd>{item.valueLabel}</dd>
        </div>
        <div>
          <dt>Cumulative</dt>
          <dd>CHF {item.totalB.toFixed(1)}B</dd>
        </div>
      </dl>
    </div>
  );
};

const renderWaterfallLabel = ({
  x,
  y,
  width,
  value,
}: WaterfallLabelProps) => {
  const numericX = typeof x === "number" ? x : Number(x ?? 0);
  const numericY = typeof y === "number" ? y : Number(y ?? 0);
  const numericWidth = typeof width === "number" ? width : Number(width ?? 0);

  return (
    <text
      className="waterfall-value-label"
      textAnchor="middle"
      x={numericX + numericWidth / 2}
      y={numericY - 6}
    >
      {value}
    </text>
  );
};

const createInlineKpis = (kpis: AdvisoryKpi[]) => {
  const totalAum = findKpi(kpis, "Total AUM");
  const netNewMoney = findKpi(kpis, "Net New Money");
  const advisoryCoverage = findKpi(kpis, "Advisory Coverage");
  const atRiskAccounts = findKpi(kpis, "At-Risk Accounts");

  return [
    {
      label: "AUM (CHF)",
      value: totalAum?.value ?? "CHF 24.8B",
      delta: totalAum?.delta ?? "+6.4%",
      tone: kpiToneClass(totalAum),
    },
    {
      label: "Net New Money",
      value: netNewMoney?.value ?? "CHF 562M",
      delta: netNewMoney?.delta ?? "+3.1%",
      tone: kpiToneClass(netNewMoney),
    },
    {
      label: "Advisory Coverage",
      value: advisoryCoverage?.value ?? "78%",
      delta: advisoryCoverage?.delta ?? "+4pp",
      tone: kpiToneClass(advisoryCoverage),
    },
    {
      label: "At-Risk Accounts",
      value: atRiskAccounts?.value ?? "52",
      delta: atRiskAccounts?.delta ?? "+8",
      tone: kpiToneClass(atRiskAccounts),
    },
  ];
};

const kpiToneClass = (kpi: AdvisoryKpi | undefined) => {
  if (kpi?.trend === "negative") return "negative";
  if (kpi?.trend === "neutral") return "neutral";
  return "positive";
};

const findKpi = (kpis: AdvisoryKpi[], label: string) =>
  kpis.find((kpi) => kpi.label === label);

const createRiskLayerSeries = (
  trend: RiskExposureTrendPoint[],
): RiskLayerDatum[] =>
  trend.map((point) => ({
    date: point.label,
    eventLabel: point.eventLabel,
    noRiskB: chfToB(point.noRiskAumChf),
    lowB: chfToB(point.lowRiskAumChf),
    mediumB: chfToB(point.mediumRiskAumChf),
    highB: chfToB(point.highRiskAumChf),
    netNewMoneyB: chfToB(point.netNewMoneyChf),
  }));

const createXAxisTicks = (data: RiskLayerDatum[]) => {
  if (data.length <= 7) return data.map((point) => point.date);

  return [
    ...new Set(
      [
        data[0]?.date,
        ...data.filter((point) => point.eventLabel).map((point) => point.date),
        data[Math.floor(data.length / 2)]?.date,
        data[data.length - 1]?.date,
      ].filter((value): value is string => typeof value === "string"),
    ),
  ];
};

const createAumAxis = (data: RiskLayerDatum[]) => {
  const maxStack = Math.max(
    ...data.map(
      (item) => item.noRiskB + item.lowB + item.mediumB + item.highB,
    ),
    1,
  );
  const max = roundUpToNiceStep(maxStack * 1.2);
  const step = max / 3;
  return {
    max,
    ticks: [0, roundB(step), roundB(step * 2), max],
  };
};

const roundUpToNiceStep = (value: number) => Math.ceil(value / 5) * 5;

const createRiskSummaryRows = (
  rows: AdvisoryWorklistRow[],
): RiskSummaryRow[] => {
  const totalCount = Math.max(rows.length, 1);
  const summary = rows.reduce(
    (current, row) => {
      if (row.priority === "High") {
        current.high.count += 1;
        current.high.aumChf += row.aumChf;
      } else if (row.priority === "Medium") {
        current.medium.count += 1;
        current.medium.aumChf += row.aumChf;
      } else if (row.priority === "Low") {
        current.low.count += 1;
        current.low.aumChf += row.aumChf;
      } else {
        current.noRisk.count += 1;
        current.noRisk.aumChf += row.aumChf;
      }
      return current;
    },
    {
      high: { aumChf: 0, count: 0 },
      medium: { aumChf: 0, count: 0 },
      low: { aumChf: 0, count: 0 },
      noRisk: { aumChf: 0, count: 0 },
    },
  );

  return [
    {
      label: "High",
      aumChf: summary.high.aumChf,
      count: summary.high.count,
      percent: percent(summary.high.count, totalCount),
      className: "high",
    },
    {
      label: "Medium",
      aumChf: summary.medium.aumChf,
      count: summary.medium.count,
      percent: percent(summary.medium.count, totalCount),
      className: "medium",
    },
    {
      label: "Low",
      aumChf: summary.low.aumChf,
      count: summary.low.count,
      percent: percent(summary.low.count, totalCount),
      className: "low",
    },
    {
      label: "No risk",
      aumChf: summary.noRisk.aumChf,
      count: summary.noRisk.count,
      percent: percent(summary.noRisk.count, totalCount),
      className: "no-risk",
    },
  ];
};

const createMomentumChartData = (
  trend: AdvisoryDashboardSnapshot["netNewMoneyTrend"],
): MomentumDatum[] => {
  const values = trend.length ? trend : createFallbackMomentumTrend();

  return values.map((point, index) => ({
    id: point.id,
    fill:
      index === values.length - 1
        ? "#10b981"
        : point.netNewMoneyChf < 0
          ? "#fecaca"
          : "#e5e7eb",
    isFinal: index === values.length - 1,
    label: point.label,
    valueB: chfToB(point.netNewMoneyChf),
  }));
};

const createFallbackMomentumTrend =
  (): AdvisoryDashboardSnapshot["netNewMoneyTrend"] => {
  const monthStart = startOfCurrentUtcMonth();
  const amounts = [
    -500_000_000,
    240_000_000,
    680_000_000,
    420_000_000,
    760_000_000,
    1_200_000_000,
  ];

  return amounts.map((netNewMoneyChf, index) => {
    const date = addUtcMonths(monthStart, index - (amounts.length - 1));
    return {
      id: `fallback-${index + 1}`,
      label: formatFallbackMonthLabel(date),
      month: new Date(date).toISOString().slice(0, 10),
      netNewMoneyChf,
    };
  });
};

const startOfCurrentUtcMonth = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
};

const addUtcMonths = (value: number, months: number) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
};

const formatFallbackMonthLabel = (value: number) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));

const createMomentumDomain = (data: MomentumDatum[]) => {
  const values = data.map((item) => item.valueB);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const padding = Math.max((max - min) * 0.14, 0.08);
  return [roundB(min - padding), roundB(max + padding)] as [number, number];
};

const minMomentumValue = (data: MomentumDatum[]) =>
  data.reduce(
    (minimum, item) => Math.min(minimum, item.valueB),
    data[0]?.valueB ?? 0,
  );

const lastMomentumValue = (data: MomentumDatum[]) =>
  data[data.length - 1]?.valueB ?? 0;

const radarAxes = [
  "Liquidity",
  "Credit",
  "Concentration",
  "Margin",
  "Covenant",
  "Collateral",
] as const;

const segmentKeyByLabel: Record<
  string,
  Exclude<keyof RadarDatum, "axis">
> = {
  Corporate: "corporate",
  Institutional: "institutional",
  UHNW: "uhnw",
};

const createRadarData = (scores: SegmentRiskScoreRow[]): RadarDatum[] => {
  const scoreByAxis = new Map<string, RadarDatum>();
  for (const axis of radarAxes) {
    scoreByAxis.set(axis, {
      axis,
      corporate: 0,
      institutional: 0,
      uhnw: 0,
    });
  }

  for (const score of scores) {
    const key = segmentKeyByLabel[score.segment];
    const datum = scoreByAxis.get(score.riskAxis);
    if (!key || !datum) continue;
    datum[key] = score.score;
  }

  return [...scoreByAxis.values()];
};

const createWaterfallData = (
  rows: RiskDriverExposureRow[],
): WaterfallChartData => {
  const totalB = chfToB(
    rows.reduce((current, row) => current + row.exposureChf, 0),
  );
  const maxB = Math.max(1, Math.ceil(totalB));
  let runningB = 0;
  const items: WaterfallTooltipDatum[] = rows.map((item) => {
    const valueB = chfToB(item.exposureChf);
    const datum: WaterfallTooltipDatum = {
      baseB: runningB,
      className: getRiskDriverClassName(item.driver),
      driver: item.driver,
      label: splitWaterfallLabel(item.driver),
      totalB: roundB(runningB + valueB),
      valueB,
      valueLabel: `CHF ${valueB.toFixed(1)}B`,
    };
    runningB += valueB;
    return datum;
  });

  items.push({
    baseB: 0,
    className: "total",
    driver: "Total at-risk AUM",
    label: "Total",
    totalB,
    valueB: totalB,
    valueLabel: `CHF ${totalB.toFixed(1)}B`,
  });

  return {
    items,
    maxB,
    ticks: [0, roundB(maxB / 3), roundB((maxB * 2) / 3), maxB],
    totalLabel: `CHF ${totalB.toFixed(1)}B`,
  };
};

const getRiskDriverClassName = (driver: string): RiskDriverClassName => {
  const normalized = driver.toLowerCase();
  if (normalized.includes("liquidity")) return "liquidity";
  if (normalized.includes("margin")) return "margin";
  if (normalized.includes("credit")) return "credit";
  if (normalized.includes("collateral")) return "collateral";
  if (normalized.includes("market")) return "market";
  return "other";
};

const splitWaterfallLabel = (label: string) =>
  label.split(/\s+/)[0] ?? label;

const formatSignedB = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(1)}B`;

const percent = (count: number, total: number) =>
  Math.round((count / total) * 100);

const chfToB = (value: number) => roundB(value / 1_000_000_000);

const roundB = (value: number) => Math.round(value * 100) / 100;
