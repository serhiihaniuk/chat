export const appearanceStorageKey = "sidechat.appearancePreset";

export const appearancePresets = [
  {
    id: "ubs",
    label: "UBS",
    accent: "#e60000",
    background: "#ffffff",
    foreground: "#0f172a",
    surface: "#f8fafc",
    border: "#e2e8f0",
  },
  {
    id: "vercel",
    label: "Vercel",
    accent: "#006efe",
    background: "#ffffff",
    foreground: "#111827",
    surface: "#f3f4f6",
    border: "#d1d5db",
  },
  {
    id: "emerald",
    label: "Emerald",
    accent: "#059669",
    background: "#fbfdfb",
    foreground: "#10231b",
    surface: "#ecfdf5",
    border: "#c7e5d5",
  },
] as const;

export type AppearancePreset = (typeof appearancePresets)[number];
export type AppearancePresetId = AppearancePreset["id"];

export const defaultAppearancePresetId: AppearancePresetId = "emerald";

export const isAppearancePresetId = (
  value: string,
): value is AppearancePresetId =>
  appearancePresets.some((preset) => preset.id === value);

export const getAppearancePreset = (presetId: AppearancePresetId) =>
  appearancePresets.find((preset) => preset.id === presetId) ??
  appearancePresets[0];
