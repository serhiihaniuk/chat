export const omitUndefined = <T extends Record<string, unknown>>(
  value: T,
): Partial<T> =>
  Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
