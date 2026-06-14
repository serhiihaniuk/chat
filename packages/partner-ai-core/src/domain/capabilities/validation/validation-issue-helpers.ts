import type {
  HostCapabilityValidationCode,
  HostCapabilityValidationIssue,
} from "../contracts/capabilities.js";

export const duplicateValueIssues = (
  values: readonly string[],
  path: string,
  code: HostCapabilityValidationCode,
  label: string,
): readonly HostCapabilityValidationIssue[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return [...duplicates].map((value) => ({
    code,
    path,
    message: `Duplicate ${label} ${value}.`,
  }));
};

export const unknownValueIssues = (
  values: readonly string[],
  knownValues: ReadonlySet<string>,
  path: string,
  code: HostCapabilityValidationCode,
  message: (value: string) => string,
): readonly HostCapabilityValidationIssue[] =>
  values
    .filter((value) => !knownValues.has(value))
    .map((value) => ({
      code,
      path,
      message: message(value),
    }));
