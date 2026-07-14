// Summarizes Pi subagent run history and deterministic verification usage so
// budget and routing tuning stays evidence-based. Read-only. Pi-only tooling:
// production source must not import this.
//
// Usage: node scripts/pi-run-stats.mjs [--json]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ARTIFACTS_DIRECTORY = ".pi-subagents/artifacts";
const VERIFICATION_DIRECTORY = ".pi/runtime/verification";
const META_FILE_SUFFIX = "_meta.json";
const VERIFICATION_LOG_PATTERN = /^(?<timestamp>.+)-(?<tier>focused|standard|full)\.log$/u;

const RUN_OUTCOMES = {
  COMPLETED: "completed",
  BUDGET_DEATH: "budget-death",
  GUARD_REJECTED: "guard-rejected",
  FAILED_OTHER: "failed-other",
};

const ERROR_MARKERS = {
  BUDGET: "exceeded turn budget",
  GUARD: "without making edits",
};

const REVIVAL_TASK_PREFIX = "You are reviving a previous subagent conversation.";

function classifyOutcome(meta) {
  if (meta.exitCode === 0) return RUN_OUTCOMES.COMPLETED;
  const error = meta.error ?? "";
  if (error.includes(ERROR_MARKERS.BUDGET)) return RUN_OUTCOMES.BUDGET_DEATH;
  if (error.includes(ERROR_MARKERS.GUARD)) return RUN_OUTCOMES.GUARD_REJECTED;
  return RUN_OUTCOMES.FAILED_OTHER;
}

function readRuns(rootDirectory) {
  const artifactsPath = join(rootDirectory, ARTIFACTS_DIRECTORY);
  if (!existsSync(artifactsPath)) return [];
  const runs = [];
  for (const fileName of readdirSync(artifactsPath)) {
    if (!fileName.endsWith(META_FILE_SUFFIX)) continue;
    const meta = JSON.parse(readFileSync(join(artifactsPath, fileName), "utf8"));
    const usage = meta.usage ?? {};
    runs.push({
      runId: meta.runId,
      agent: meta.agent,
      model: meta.model,
      outcome: classifyOutcome(meta),
      revival: (meta.task ?? "").startsWith(REVIVAL_TASK_PREFIX),
      usageRecorded: usage.turns !== undefined,
      turns: usage.turns ?? 0,
      cost: usage.cost ?? 0,
      cacheReadTokens: usage.cacheRead ?? 0,
      timestamp: meta.timestamp,
    });
  }
  return runs.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}

function readVerificationCounts(rootDirectory) {
  const verificationPath = join(rootDirectory, VERIFICATION_DIRECTORY);
  const counts = { focused: 0, standard: 0, full: 0 };
  if (!existsSync(verificationPath)) return counts;
  for (const fileName of readdirSync(verificationPath)) {
    const tier = VERIFICATION_LOG_PATTERN.exec(fileName)?.groups?.tier;
    if (tier) counts[tier] += 1;
  }
  return counts;
}

function weekKey(timestamp) {
  if (!timestamp) return "unknown";
  const date = new Date(timestamp);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function sumCost(runs) {
  return runs.reduce((total, run) => total + run.cost, 0);
}

function buildSummary(runs, verificationCounts) {
  const completedRuns = runs.filter((run) => run.outcome === RUN_OUTCOMES.COMPLETED);
  const abortedRuns = runs.filter((run) => run.outcome !== RUN_OUTCOMES.COMPLETED);
  const totalCost = sumCost(runs);
  const outcomes = Object.fromEntries(
    Object.values(RUN_OUTCOMES).map((outcome) => {
      const matching = runs.filter((run) => run.outcome === outcome);
      return [outcome, { runs: matching.length, cost: sumCost(matching) }];
    }),
  );
  const weeks = {};
  for (const run of runs) {
    const key = weekKey(run.timestamp);
    weeks[key] ??= { runs: 0, cost: 0, abortedCost: 0 };
    weeks[key].runs += 1;
    weeks[key].cost += run.cost;
    if (run.outcome !== RUN_OUTCOMES.COMPLETED) weeks[key].abortedCost += run.cost;
  }
  const agents = {};
  for (const run of runs) {
    agents[run.agent] ??= { runs: 0, completed: 0, cost: 0 };
    agents[run.agent].runs += 1;
    if (run.outcome === RUN_OUTCOMES.COMPLETED) agents[run.agent].completed += 1;
    agents[run.agent].cost += run.cost;
  }
  return {
    totalRuns: runs.length,
    unrecordedUsageRuns: runs.filter((run) => !run.usageRecorded).length,
    totalCost,
    completedCost: sumCost(completedRuns),
    abortedCost: sumCost(abortedRuns),
    abortedShare: totalCost > 0 ? sumCost(abortedRuns) / totalCost : 0,
    revivals: runs.filter((run) => run.revival).length,
    cacheReadTokens: runs.reduce((total, run) => total + run.cacheReadTokens, 0),
    outcomes,
    weeks,
    agents,
    verifications: verificationCounts,
  };
}

function money(value) {
  return `$${value.toFixed(2)}`;
}

function percent(ratio) {
  return `${Math.round(ratio * 100)}%`;
}

function printReport(summary) {
  const lines = [];
  lines.push(`Pi run history — ${summary.totalRuns} archived runs`);
  if (summary.unrecordedUsageRuns > 0) {
    lines.push(`(${summary.unrecordedUsageRuns} runs have no recorded usage and count as $0)`);
  }
  lines.push("");
  lines.push("Outcome           Runs   Cost");
  for (const [outcome, data] of Object.entries(summary.outcomes)) {
    if (data.runs === 0) continue;
    lines.push(`${outcome.padEnd(17)} ${String(data.runs).padStart(4)}  ${money(data.cost)}`);
  }
  lines.push("");
  lines.push(
    `Total ${money(summary.totalCost)} — completed ${money(summary.completedCost)}, ` +
      `aborted before a usable report ${money(summary.abortedCost)} (${percent(summary.abortedShare)} of spend)`,
  );
  lines.push(
    `Savings signals: revivals ${summary.revivals} (reused a dead run instead of a fresh child), ` +
      `cache reads ${(summary.cacheReadTokens / 1_000_000).toFixed(1)}M tokens (billed below fresh input)`,
  );
  lines.push("");
  lines.push("Week of      Runs   Cost   Aborted");
  for (const [week, data] of Object.entries(summary.weeks).sort()) {
    lines.push(
      `${week}  ${String(data.runs).padStart(5)}  ${money(data.cost).padStart(6)}  ${money(data.abortedCost).padStart(6)}`,
    );
  }
  lines.push("");
  lines.push("Agent              Runs  Completed   Cost");
  for (const [agent, data] of Object.entries(summary.agents).sort()) {
    lines.push(
      `${agent.padEnd(18)} ${String(data.runs).padStart(4)}  ${String(data.completed).padStart(9)}  ${money(data.cost)}`,
    );
  }
  lines.push("");
  const verifications = summary.verifications;
  lines.push(
    `Deterministic verifications (no agent turns spent): ` +
      `focused ${verifications.focused}, standard ${verifications.standard}, full ${verifications.full}`,
  );
  console.log(lines.join("\n"));
}

const rootDirectory = process.cwd();
const summary = buildSummary(readRuns(rootDirectory), readVerificationCounts(rootDirectory));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printReport(summary);
}
