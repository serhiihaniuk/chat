import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

import { SideChatWidgetRoot } from "@side-chat/side-chat-widget/ui/widget-root";

import type { TokenOverrides } from "#configurator/token-overrides";
import type { CssToken, CssTokenName } from "../token-catalog.js";
import {
  PREVIEW_SCENARIOS,
  PreviewContent,
  type PreviewScenario,
} from "./scenarios/preview-content.js";
import { WidgetShadow } from "./widget-shadow.js";

type TokenStyle = CSSProperties & Partial<Record<CssTokenName, string>>;

export function LivePreview({
  onResolvedValuesChange,
  overrides,
  theme,
  tokens,
}: {
  readonly onResolvedValuesChange: (
    values: ReadonlyMap<CssTokenName, string>,
  ) => void;
  readonly overrides: TokenOverrides;
  readonly theme: string;
  readonly tokens: readonly CssToken[];
}): ReactElement {
  const [scenario, setScenario] = useState<PreviewScenario>(
    PREVIEW_SCENARIOS.CHAT,
  );
  const style = useMemo(() => tokenStyle(overrides), [overrides]);
  const previewRevision = useMemo(
    () => `${theme}:${JSON.stringify([...overrides])}`,
    [overrides, theme],
  );

  return (
    <section className="docs-preview-panel" aria-label="Live widget preview">
      <div className="docs-preview-toolbar">
        <div>
          <p className="docs-preview-kicker">Live preview</p>
          <h2>Real widget components</h2>
        </div>
        <div
          className="docs-segmented-control"
          role="group"
          aria-label="Preview scenario"
        >
          {Object.values(PREVIEW_SCENARIOS).map((option) => (
            <button
              aria-pressed={scenario === option}
              key={option}
              onClick={() => setScenario(option)}
              type="button"
            >
              {humanize(option)}
            </button>
          ))}
        </div>
      </div>
      <div className="docs-preview-canvas">
        <WidgetShadow>
          <SideChatWidgetRoot
            className="docs-preview-widget"
            data-sidechat-theme={theme === "graphite" ? undefined : theme}
            style={style}
          >
            <ResolvedValueProbe
              onChange={onResolvedValuesChange}
              revision={previewRevision}
              tokens={tokens}
            />
            <PreviewContent scenario={scenario} />
          </SideChatWidgetRoot>
        </WidgetShadow>
      </div>
    </section>
  );
}

function ResolvedValueProbe({
  onChange,
  revision,
  tokens,
}: {
  readonly onChange: (values: ReadonlyMap<CssTokenName, string>) => void;
  readonly revision: string;
  readonly tokens: readonly CssToken[];
}): ReactElement {
  const probe = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = probe.current?.parentElement;
    if (!root) return;
    const computed = getComputedStyle(root);
    onChange(
      new Map(
        tokens.map((token) => [
          token.name,
          computed.getPropertyValue(token.name).trim(),
        ]),
      ),
    );
  }, [onChange, revision, tokens]);
  return <span aria-hidden="true" className="docs-token-probe" ref={probe} />;
}

function tokenStyle(overrides: TokenOverrides): TokenStyle {
  const style: TokenStyle = {};
  for (const [name, value] of overrides) style[name] = value;
  return style;
}

function humanize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
