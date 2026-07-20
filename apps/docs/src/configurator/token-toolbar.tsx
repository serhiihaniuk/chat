import { Check, Copy, RotateCcw, Search } from "lucide-react";
import { useState, type ReactElement } from "react";

import type { TokenOverrides } from "./token-overrides.js";
import { serializeTokenOverrides } from "./token-overrides.js";

export const CONFIGURATOR_VIEWS = {
  DESIGN: "design",
  TOKENS: "tokens",
} as const;

export type ConfiguratorView = (typeof CONFIGURATOR_VIEWS)[keyof typeof CONFIGURATOR_VIEWS];

export function TokenToolbar({
  modifiedOnly,
  onModifiedOnlyChange,
  onResetAll,
  onSearchChange,
  onThemeChange,
  overrides,
  search,
  theme,
  themes,
  view,
  onViewChange,
}: {
  readonly modifiedOnly: boolean;
  readonly onModifiedOnlyChange: (value: boolean) => void;
  readonly onResetAll: () => void;
  readonly onSearchChange: (value: string) => void;
  readonly onThemeChange: (value: string) => void;
  readonly overrides: TokenOverrides;
  readonly search: string;
  readonly theme: string;
  readonly themes: readonly string[];
  readonly view: ConfiguratorView;
  readonly onViewChange: (value: ConfiguratorView) => void;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const copyOverrides = async (): Promise<void> => {
    await navigator.clipboard.writeText(serializeTokenOverrides(overrides));
    setCopied(true);
  };

  return (
    <div className="docs-toolbar">
      <div className="docs-view-switch" role="group" aria-label="Editor mode">
        <button
          aria-pressed={view === CONFIGURATOR_VIEWS.DESIGN}
          onClick={() => onViewChange(CONFIGURATOR_VIEWS.DESIGN)}
          type="button"
        >
          Visual editor
        </button>
        <button
          aria-pressed={view === CONFIGURATOR_VIEWS.TOKENS}
          onClick={() => onViewChange(CONFIGURATOR_VIEWS.TOKENS)}
          type="button"
        >
          CSS tokens
        </button>
      </div>
      <label className="docs-search">
        <Search aria-hidden="true" size={16} />
        <span className="docs-visually-hidden">Search tokens</span>
        <input
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={
            view === CONFIGURATOR_VIEWS.DESIGN ? "Search design settings" : "Search CSS tokens"
          }
          spellCheck={false}
          type="search"
          value={search}
        />
      </label>

      <label className="docs-select-field">
        <span>Theme</span>
        <select onChange={(event) => onThemeChange(event.target.value)} value={theme}>
          {themes.map((option) => (
            <option key={option} value={option}>
              {humanize(option)}
            </option>
          ))}
        </select>
      </label>

      <label className="docs-check-field">
        <input
          checked={modifiedOnly}
          onChange={(event) => onModifiedOnlyChange(event.target.checked)}
          type="checkbox"
        />
        Modified only
      </label>

      <div className="docs-toolbar-actions">
        <button
          className="docs-button docs-button-secondary"
          disabled={overrides.size === 0}
          onClick={() => void copyOverrides()}
          type="button"
        >
          {copied ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
          {copied ? "Copied" : "Copy JSON"}
        </button>
        <button
          className="docs-button docs-button-secondary"
          disabled={overrides.size === 0}
          onClick={onResetAll}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={15} />
          Reset all
        </button>
      </div>
    </div>
  );
}

function humanize(value: string): string {
  const normalized = value.replace(/[-_]+/gu, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
