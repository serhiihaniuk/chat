import { useMemo, useState, type ReactElement } from "react";

import { LivePreview } from "#preview/live-preview";
import type { CssToken, CssTokenGroup, CssTokenName } from "../token-catalog.js";
import { validateCssTokenValue } from "../token-catalog.js";
import { TokenEditorPanel } from "./editor/token-editor-panel.js";
import {
  createTokenOverrides,
  resetTokenOverrides,
  updateTokenOverride,
  type TokenOverrides,
} from "./token-overrides.js";
import { CONFIGURATOR_VIEWS, TokenToolbar, type ConfiguratorView } from "./token-toolbar.js";

type ResolvedValues = ReadonlyMap<CssTokenName, string>;

const DESIGN_GROUP_ORDER = [
  "Palette",
  "Typography",
  "Shape",
  "Spacing",
  "Sizing",
  "Elevation",
  "Motion",
  "Core",
  "Color ledger",
];

export function TokenConfigurator({
  groups,
  themes,
  tokens,
}: {
  readonly groups: readonly CssTokenGroup[];
  readonly themes: readonly string[];
  readonly tokens: readonly CssToken[];
}): ReactElement {
  const [modifiedOnly, setModifiedOnly] = useState(false);
  const [resolvedValues, setResolvedValues] = useState<ResolvedValues>(new Map());
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState(themes[0] ?? "graphite");
  const [view, setView] = useState<ConfiguratorView>(CONFIGURATOR_VIEWS.DESIGN);
  const overrideState = useOverrideState();
  const catalogState = useCatalogGroups({
    groups,
    modifiedOnly,
    overrides: overrideState.overrides,
    resolvedValues,
    search,
  });
  const [designGroupId, setDesignGroupId] = useState(catalogState.designGroups[0]?.id ?? "");
  const visibleGroups = selectVisibleGroups({ ...catalogState, designGroupId, search, view });
  const clearSearch = (): void => setSearch("");

  return (
    <main className="docs-app-shell">
      <header className="docs-page-header">
        <div>
          <p className="docs-eyebrow">Side Chat design system</p>
          <h1>Design the widget</h1>
          <p className="docs-page-summary">
            Shape color, type, spacing, and components while the real interface updates live.
          </p>
        </div>
        <div className="docs-stat-cluster" aria-label="Catalog summary">
          <span>
            <strong>{overrideState.overrides.size}</strong> modified
          </span>
        </div>
      </header>

      <TokenToolbar
        modifiedOnly={modifiedOnly}
        onModifiedOnlyChange={setModifiedOnly}
        onResetAll={overrideState.resetAll}
        onSearchChange={setSearch}
        onThemeChange={setTheme}
        overrides={overrideState.overrides}
        search={search}
        theme={theme}
        themes={themes}
        view={view}
        onViewChange={setView}
      />

      <div className="docs-workspace">
        <TokenEditorPanel
          designGroupId={designGroupId}
          designGroups={catalogState.designGroups}
          onDesignGroupChange={setDesignGroupId}
          onGroupReset={overrideState.resetGroup}
          onSearchClear={clearSearch}
          onTokenChange={overrideState.changeToken}
          onTokenReset={overrideState.resetToken}
          overrides={overrideState.overrides}
          resolvedValues={resolvedValues}
          visual={view === CONFIGURATOR_VIEWS.DESIGN}
          visibleGroups={visibleGroups}
        />

        <LivePreview
          onResolvedValuesChange={setResolvedValues}
          overrides={overrideState.previewOverrides}
          theme={theme}
          tokens={tokens}
        />
      </div>
    </main>
  );
}

type CatalogState = {
  readonly designGroups: readonly CssTokenGroup[];
  readonly filteredGroups: readonly CssTokenGroup[];
};

function useCatalogGroups({
  groups,
  modifiedOnly,
  overrides,
  resolvedValues,
  search,
}: {
  readonly groups: readonly CssTokenGroup[];
  readonly modifiedOnly: boolean;
  readonly overrides: TokenOverrides;
  readonly resolvedValues: ResolvedValues;
  readonly search: string;
}): CatalogState {
  const designGroups = useMemo(() => orderDesignGroups(groups), [groups]);
  const filteredGroups = useMemo(
    () => filterGroups(groups, overrides, resolvedValues, search, modifiedOnly),
    [groups, modifiedOnly, overrides, resolvedValues, search],
  );
  return { designGroups, filteredGroups };
}

function selectVisibleGroups({
  designGroupId,
  filteredGroups,
  search,
  view,
}: CatalogState & {
  readonly designGroupId: string;
  readonly search: string;
  readonly view: ConfiguratorView;
}): readonly CssTokenGroup[] {
  if (view === CONFIGURATOR_VIEWS.TOKENS) return filteredGroups;
  const foundations = filteredGroups.filter((group) => group.label.startsWith("Foundations"));
  if (search.trim()) return orderDesignGroups(foundations);
  return foundations.filter((group) => group.id === designGroupId);
}

function useOverrideState() {
  const [overrides, setOverrides] = useState<TokenOverrides>(createTokenOverrides);
  const previewOverrides = useMemo(() => validOverrides(overrides), [overrides]);
  const changeToken = (token: CssToken, value: string): void => {
    setOverrides((current) => updateTokenOverride(current, token, value));
  };
  const resetGroup = (group: CssTokenGroup): void => {
    const names: CssTokenName[] = [];
    for (const token of group.tokens) names.push(token.name);
    setOverrides((current) => resetTokenOverrides(current, names));
  };
  const resetToken = (name: CssTokenName): void => {
    setOverrides((current) => resetTokenOverrides(current, [name]));
  };
  const resetAll = (): void => setOverrides(createTokenOverrides());
  return { changeToken, overrides, previewOverrides, resetAll, resetGroup, resetToken };
}

function orderDesignGroups(groups: readonly CssTokenGroup[]): readonly CssTokenGroup[] {
  return groups
    .filter((group) => group.label.startsWith("Foundations"))
    .toSorted((left, right) => {
      const leftIndex = DESIGN_GROUP_ORDER.findIndex((name) => left.label.endsWith(name));
      const rightIndex = DESIGN_GROUP_ORDER.findIndex((name) => right.label.endsWith(name));
      return (
        (leftIndex < 0 ? DESIGN_GROUP_ORDER.length : leftIndex) -
        (rightIndex < 0 ? DESIGN_GROUP_ORDER.length : rightIndex)
      );
    });
}

function filterGroups(
  groups: readonly CssTokenGroup[],
  overrides: TokenOverrides,
  resolvedValues: ResolvedValues,
  search: string,
  modifiedOnly: boolean,
): readonly CssTokenGroup[] {
  const query = search.trim().toLowerCase();
  return groups.flatMap((group) => {
    const tokens = group.tokens.filter((token) => {
      if (modifiedOnly && !overrides.has(token.name)) return false;
      if (!query) return true;
      return [
        group.label,
        token.name,
        token.defaultValue,
        overrides.get(token.name),
        resolvedValues.get(token.name),
      ].some((value) => value?.toLowerCase().includes(query));
    });
    return tokens.length ? [{ ...group, tokens }] : [];
  });
}

function validOverrides(overrides: TokenOverrides): TokenOverrides {
  return new Map([...overrides].filter(([, value]) => validateCssTokenValue(value) === undefined));
}
