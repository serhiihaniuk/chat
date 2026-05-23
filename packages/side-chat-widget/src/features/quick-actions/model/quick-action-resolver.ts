import type { QuickAction } from "./quick-action.js";

export type QuickActionSelection =
  | {
      readonly prompt: string;
      readonly status: "selected";
    }
  | {
      readonly reason: "disabled" | "empty_prompt";
      readonly status: "ignored";
    };

export const resolveQuickActionPrompt = (action: QuickAction): string =>
  action.prompt.trim();

export const resolveQuickActionSelection = (
  action: QuickAction,
): QuickActionSelection => {
  const prompt = resolveQuickActionPrompt(action);
  if (action.disabled) return { reason: "disabled", status: "ignored" };
  if (prompt.length === 0) return { reason: "empty_prompt", status: "ignored" };
  return { prompt, status: "selected" };
};
