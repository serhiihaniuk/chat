import { useSyncExternalStore, type CSSProperties, type ReactElement } from "react";

import type {
  DemoHostCommandLogEntry,
  DemoHostRecord,
  DemoHostRecordOrigin,
  DemoHostSurface,
} from "#host/demo-host-surface";

/**
 * Visible host-app surface for the harness.
 *
 * Renders the demo host state and the controls a person can click directly, so
 * the same records that a human edits are the ones the assistant mutates through
 * the `open_resource` host command. Pinned to a corner with a high stacking
 * order so it stays visible next to the floating chat panel during a demo.
 */
const ORIGIN_LABELS: Record<DemoHostRecordOrigin, string> = {
  seed: "Seed",
  manual: "Manual",
  assistant: "Assistant",
};

export const DemoHostPanel = ({ surface }: { readonly surface: DemoHostSurface }): ReactElement => {
  const state = useSyncExternalStore(surface.subscribe, surface.getSnapshot, surface.getSnapshot);

  return (
    <section style={styles.panel} data-testid="demo-host" aria-label="Demo host app">
      <header>
        <p style={styles.eyebrow}>Demo host app</p>
        <h2 style={styles.title}>Workbench records</h2>
        <p style={styles.subtitle}>
          This panel is the host page. The assistant changes it through the{" "}
          <code style={styles.code}>open_resource</code> host command.
        </p>
      </header>

      <p style={styles.stat} data-testid="demo-host-assistant-count">
        Assistant actions: <strong>{state.assistantActionCount}</strong>
      </p>

      <ul style={styles.list}>
        {state.records.map((record) => (
          <RecordRow key={record.id} record={record} active={record.id === state.activeRecordId} />
        ))}
      </ul>

      <div style={styles.actions}>
        <button
          type="button"
          style={styles.button}
          onClick={surface.addManualRecord}
          data-testid="demo-host-add"
        >
          Add a record
        </button>
        <button
          type="button"
          style={styles.buttonGhost}
          onClick={surface.reset}
          data-testid="demo-host-reset"
        >
          Reset
        </button>
      </div>

      <h3 style={styles.logTitle}>Host command log</h3>
      {state.log.length === 0 ? (
        <p style={styles.empty}>No commands dispatched yet.</p>
      ) : (
        <ul style={styles.list} data-testid="demo-host-log">
          {state.log.map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
};

const RecordRow = ({
  record,
  active,
}: {
  readonly record: DemoHostRecord;
  readonly active: boolean;
}): ReactElement => (
  <li
    style={{ ...styles.record, ...(active ? styles.recordActive : null) }}
    data-testid={active ? "demo-host-active" : undefined}
  >
    <span style={styles.recordLabel}>{record.label}</span>
    <span style={styles.badge}>{ORIGIN_LABELS[record.origin]}</span>
    {active ? <span style={styles.activeDot}>● Open</span> : null}
  </li>
);

const LogRow = ({ entry }: { readonly entry: DemoHostCommandLogEntry }): ReactElement => (
  <li style={styles.logRow}>
    <code style={styles.code}>{entry.commandName}</code>
    <span style={entry.status === "applied" ? styles.statusOk : styles.statusBad}>
      {entry.status}
    </span>
    <span style={styles.resultCode}>{entry.resultCode}</span>
  </li>
);

const styles = {
  panel: {
    position: "fixed",
    top: 16,
    left: 16,
    zIndex: 2_147_483_000,
    width: 340,
    maxHeight: "calc(100vh - 32px)",
    overflow: "auto",
    boxSizing: "border-box",
    padding: 20,
    borderRadius: 16,
    border: "1px solid #e2e3e7",
    background: "#ffffff",
    boxShadow: "0 18px 48px rgba(20, 22, 28, 0.16)",
    color: "#1c1d22",
    font: "14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif",
  },
  eyebrow: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#6b6f7a",
  },
  title: { margin: "4px 0 0", fontSize: 18, fontWeight: 650 },
  subtitle: { margin: "8px 0 0", fontSize: 13, color: "#52555f" },
  stat: { margin: "16px 0 8px", fontSize: 13, color: "#52555f" },
  list: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 },
  record: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e7e8ec",
    background: "#f7f8fa",
  },
  recordActive: {
    border: "1px solid #3b6cf0",
    background: "#eef3ff",
    boxShadow: "inset 0 0 0 1px #3b6cf0",
  },
  recordLabel: { flex: 1, fontWeight: 550 },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: "#5b5f6a",
    background: "#e9eaee",
    borderRadius: 999,
    padding: "2px 8px",
  },
  activeDot: { fontSize: 11, fontWeight: 700, color: "#3b6cf0" },
  actions: { display: "flex", gap: 8, margin: "16px 0 4px" },
  button: {
    appearance: "none",
    border: "1px solid #3b6cf0",
    background: "#3b6cf0",
    color: "#ffffff",
    borderRadius: 10,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  buttonGhost: {
    appearance: "none",
    border: "1px solid #d4d6dc",
    background: "#ffffff",
    color: "#1c1d22",
    borderRadius: 10,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  logTitle: {
    margin: "18px 0 8px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#6b6f7a",
  },
  empty: { margin: 0, fontSize: 13, color: "#8a8d96" },
  logRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 8,
    background: "#f7f8fa",
    fontSize: 12,
  },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    background: "#eef0f3",
    borderRadius: 6,
    padding: "1px 6px",
  },
  statusOk: { color: "#1f8a4c", fontWeight: 700 },
  statusBad: { color: "#c23636", fontWeight: 700 },
  resultCode: { color: "#8a8d96", marginLeft: "auto" },
} satisfies Record<string, CSSProperties>;
