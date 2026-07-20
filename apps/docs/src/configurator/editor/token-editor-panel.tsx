import { RotateCcw } from "lucide-react";
import type { ReactElement } from "react";

import type { CssToken, CssTokenGroup, CssTokenName } from "../../token-catalog.js";
import { TokenControl } from "../token-control.js";
import type { TokenOverrides } from "../token-overrides.js";

export function TokenEditorPanel({
  designGroupId,
  designGroups,
  onDesignGroupChange,
  onGroupReset,
  onSearchClear,
  onTokenChange,
  onTokenReset,
  overrides,
  resolvedValues,
  visual,
  visibleGroups,
}: {
  readonly designGroupId: string;
  readonly designGroups: readonly CssTokenGroup[];
  readonly onDesignGroupChange: (groupId: string) => void;
  readonly onGroupReset: (group: CssTokenGroup) => void;
  readonly onSearchClear: () => void;
  readonly onTokenChange: (token: CssToken, value: string) => void;
  readonly onTokenReset: (name: CssTokenName) => void;
  readonly overrides: TokenOverrides;
  readonly resolvedValues: ReadonlyMap<CssTokenName, string>;
  readonly visual: boolean;
  readonly visibleGroups: readonly CssTokenGroup[];
}): ReactElement {
  return (
    <aside className="docs-token-panel" aria-label="CSS token controls">
      {visual ? (
        <DesignerNavigation
          designGroupId={designGroupId}
          designGroups={designGroups}
          onDesignGroupChange={onDesignGroupChange}
        />
      ) : null}
      <div className="docs-token-scroll">
        {visibleGroups.length ? (
          <TokenGroupList
            groups={visibleGroups}
            onGroupReset={onGroupReset}
            onTokenChange={onTokenChange}
            onTokenReset={onTokenReset}
            overrides={overrides}
            resolvedValues={resolvedValues}
            visual={visual}
          />
        ) : (
          <EmptyTokenState onSearchClear={onSearchClear} />
        )}
      </div>
    </aside>
  );
}

function DesignerNavigation({
  designGroupId,
  designGroups,
  onDesignGroupChange,
}: {
  readonly designGroupId: string;
  readonly designGroups: readonly CssTokenGroup[];
  readonly onDesignGroupChange: (groupId: string) => void;
}): ReactElement {
  return (
    <div className="docs-designer-nav">
      <div>
        <strong>What are you designing?</strong>
        <span>Start with the foundations. Fine CSS controls remain one click away.</span>
      </div>
      <select
        aria-label="Design category"
        onChange={(event) => onDesignGroupChange(event.target.value)}
        value={designGroupId}
      >
        {designGroups.map((group) => (
          <option key={group.id} value={group.id}>
            {shortGroupLabel(group.label)}
          </option>
        ))}
      </select>
    </div>
  );
}

function TokenGroupList({
  groups,
  onGroupReset,
  onTokenChange,
  onTokenReset,
  overrides,
  resolvedValues,
  visual,
}: {
  readonly groups: readonly CssTokenGroup[];
  readonly onGroupReset: (group: CssTokenGroup) => void;
  readonly onTokenChange: (token: CssToken, value: string) => void;
  readonly onTokenReset: (name: CssTokenName) => void;
  readonly overrides: TokenOverrides;
  readonly resolvedValues: ReadonlyMap<CssTokenName, string>;
  readonly visual: boolean;
}): ReactElement {
  return (
    <>
      {groups.map((group) => (
        <TokenGroup
          group={group}
          key={group.id}
          onGroupReset={onGroupReset}
          onTokenChange={onTokenChange}
          onTokenReset={onTokenReset}
          overrides={overrides}
          resolvedValues={resolvedValues}
          visual={visual}
        />
      ))}
    </>
  );
}

function TokenGroup({
  group,
  onGroupReset,
  onTokenChange,
  onTokenReset,
  overrides,
  resolvedValues,
  visual,
}: {
  readonly group: CssTokenGroup;
  readonly onGroupReset: (group: CssTokenGroup) => void;
  readonly onTokenChange: (token: CssToken, value: string) => void;
  readonly onTokenReset: (name: CssTokenName) => void;
  readonly overrides: TokenOverrides;
  readonly resolvedValues: ReadonlyMap<CssTokenName, string>;
  readonly visual: boolean;
}): ReactElement {
  const groupModified = group.tokens.some((token) => overrides.has(token.name));
  return (
    <details className="docs-token-group" open>
      <summary>
        <span>{group.label}</span>
        <span className="docs-group-count">{group.tokens.length}</span>
        {groupModified ? (
          <button
            aria-label={`Reset ${group.label}`}
            className="docs-icon-button"
            onClick={(event) => {
              event.preventDefault();
              onGroupReset(group);
            }}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
          </button>
        ) : null}
      </summary>
      <div className="docs-token-list">
        {group.tokens.map((token) => (
          <TokenControl
            key={token.name}
            modified={overrides.has(token.name)}
            onChange={(value) => onTokenChange(token, value)}
            onReset={() => onTokenReset(token.name)}
            resolvedValue={resolvedValues.get(token.name)}
            token={token}
            value={overrides.get(token.name) ?? token.defaultValue}
            visual={visual}
          />
        ))}
      </div>
    </details>
  );
}

function EmptyTokenState({ onSearchClear }: { readonly onSearchClear: () => void }): ReactElement {
  return (
    <div className="docs-empty-state">
      <p>No tokens match this filter.</p>
      <button className="docs-button docs-button-secondary" onClick={onSearchClear} type="button">
        Clear search
      </button>
    </div>
  );
}

function shortGroupLabel(label: string): string {
  return label.split("·").at(-1)?.trim() ?? label;
}
