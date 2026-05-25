export type RuntimeScope = {
  readonly abortSignal?: AbortSignal;
};

export const createRuntimeScope = (abortSignal?: AbortSignal): RuntimeScope =>
  abortSignal ? { abortSignal } : {};
