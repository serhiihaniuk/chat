export const formatChfCompact = (value: number) => {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000_000) {
    return `${sign}${(absolute / 1_000_000_000).toFixed(2)}B`;
  }
  return `${sign}${Math.round(absolute / 1_000_000)}M`;
};

export const formatSignedChfCompact = (value: number) => {
  const formatted = formatChfCompact(value);
  return value < 0 ? `(${formatted.replace("-", "")})` : formatted;
};

export const formatPercent = (value: number) => `${value.toFixed(0)}%`;

export const formatDrift = (value: number) => {
  if (value > 0) return `+${value.toFixed(0)}pp`;
  return `${value.toFixed(0)}pp`;
};
