import { RotateCcw } from "lucide-react";
import { type CSSProperties, type ReactElement } from "react";

import { validateCssTokenValue, type CssToken } from "../token-catalog.js";

type TokenControlProps = {
  readonly modified: boolean;
  readonly onChange: (value: string) => void;
  readonly onReset: () => void;
  readonly resolvedValue: string | undefined;
  readonly token: CssToken;
  readonly value: string;
  readonly visual?: boolean;
};

export function TokenControl({
  modified,
  onChange,
  onReset,
  resolvedValue,
  token,
  value,
  visual = false,
}: TokenControlProps): ReactElement {
  const error = modified ? validateCssTokenValue(value) : undefined;
  const dimension = visual ? parseDimension(resolvedValue) : undefined;
  const color = visual ? toHexColor(resolvedValue) : undefined;

  return (
    <div
      className="docs-token-row"
      data-modified={modified ? true : undefined}
      data-visual={visual ? true : undefined}
    >
      <TokenHeading
        modified={modified}
        onReset={onReset}
        resolvedValue={resolvedValue}
        token={token}
      />
      <TokenValueEditor
        color={color}
        dimension={dimension}
        error={error}
        onChange={onChange}
        token={token}
        value={value}
      />
      <TokenMeta resolvedValue={resolvedValue} token={token} />
      {error ? <p className="docs-token-error">{error}</p> : null}
    </div>
  );
}

function TokenHeading({
  modified,
  onReset,
  resolvedValue,
  token,
}: Pick<TokenControlProps, "modified" | "onReset" | "resolvedValue" | "token">): ReactElement {
  const swatchStyle = colorSwatchStyle(resolvedValue);
  return (
    <div className="docs-token-heading">
      <div className="docs-token-name-line">
        {swatchStyle ? (
          <span aria-hidden="true" className="docs-color-swatch" style={swatchStyle} />
        ) : null}
        <span className="docs-token-friendly-name">{humanizeToken(token.name)}</span>
        <code>{token.name}</code>
        {token.declaredValues.length > 1 ? (
          <span className="docs-variant-badge">{token.declaredValues.length} theme values</span>
        ) : null}
      </div>
      {modified ? <ResetTokenButton name={token.name} onReset={onReset} /> : null}
    </div>
  );
}

function ResetTokenButton({
  name,
  onReset,
}: {
  readonly name: string;
  readonly onReset: () => void;
}): ReactElement {
  return (
    <button
      aria-label={`Reset ${name}`}
      className="docs-icon-button"
      onClick={onReset}
      type="button"
    >
      <RotateCcw aria-hidden="true" size={14} />
    </button>
  );
}

type DimensionControl = ReturnType<typeof parseDimension>;

function TokenValueEditor({
  color,
  dimension,
  error,
  onChange,
  token,
  value,
}: Pick<TokenControlProps, "onChange" | "token" | "value"> & {
  readonly color: string | undefined;
  readonly dimension: DimensionControl;
  readonly error: string | undefined;
}): ReactElement {
  if (color) return <ColorEditor color={color} onChange={onChange} token={token} />;
  if (dimension)
    return (
      <DimensionEditor dimension={dimension} onChange={onChange} token={token} value={value} />
    );
  return (
    <div className="docs-token-input-line">
      <input
        aria-invalid={error ? true : undefined}
        aria-label={`Value for ${token.name}`}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        value={value}
      />
    </div>
  );
}

function ColorEditor({
  color,
  onChange,
  token,
}: Pick<TokenControlProps, "onChange" | "token"> & { readonly color: string }): ReactElement {
  return (
    <div className="docs-visual-color-control">
      <input
        aria-label={`Choose ${humanizeToken(token.name)}`}
        onChange={(event) => onChange(event.target.value)}
        onInput={(event) => onChange(event.currentTarget.value)}
        type="color"
        value={color}
      />
      <span>{color.toUpperCase()}</span>
    </div>
  );
}

function DimensionEditor({
  dimension,
  onChange,
  token,
  value,
}: Pick<TokenControlProps, "onChange" | "token" | "value"> & {
  readonly dimension: NonNullable<DimensionControl>;
}): ReactElement {
  return (
    <div className="docs-visual-range-control">
      <input
        aria-label={`Adjust ${humanizeToken(token.name)}`}
        max={dimension.max}
        min="0"
        onChange={(event) => onChange(`${event.target.value}${dimension.unit}`)}
        onInput={(event) => onChange(`${event.currentTarget.value}${dimension.unit}`)}
        step={dimension.step}
        type="range"
        value={dimension.value}
      />
      <span>{value}</span>
    </div>
  );
}

function TokenMeta({
  resolvedValue,
  token,
}: Pick<TokenControlProps, "resolvedValue" | "token">): ReactElement {
  return (
    <div className="docs-token-meta">
      <span title={token.defaultValue}>Default: {token.defaultValue}</span>
      {resolvedValue ? <span title={resolvedValue}>Resolved: {resolvedValue}</span> : null}
    </div>
  );
}

function humanizeToken(name: string): string {
  return name
    .replace(/^--/u, "")
    .replace(/[-_]+/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function parseDimension(
  value: string | undefined,
):
  | { readonly max: number; readonly step: number; readonly unit: string; readonly value: number }
  | undefined {
  const match = value?.match(/^(-?\d*\.?\d+)(px|rem)$/u);
  if (!match) return undefined;
  const numeric = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(numeric) || !unit) return undefined;
  const step = unit === "px" ? 0.5 : 0.0625;
  const baselineMax = unit === "px" ? 80 : 5;
  return { max: Math.max(baselineMax, numeric * 3), step, unit, value: numeric };
}

function toHexColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^#[\da-f]{6}$/iu.test(value)) return value;
  const rgb = value.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/iu);
  if (rgb) return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  const oklch = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/iu);
  if (!oklch) return undefined;
  return oklchToHex(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));
}

function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const angle = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;
  return rgbToHex(
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  );
}

function linearToSrgb(value: number): number {
  const converted = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, converted)) * 255);
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function colorSwatchStyle(value: string | undefined): CSSProperties | undefined {
  if (!value || typeof CSS === "undefined" || !CSS.supports("color", value)) return undefined;
  return { background: value };
}
