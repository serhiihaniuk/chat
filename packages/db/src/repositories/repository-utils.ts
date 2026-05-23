import type { RepositoryCommandResult } from "#schema-contract";

export const result = <RecordType>(
  record: RecordType,
  inserted: boolean,
): RepositoryCommandResult<RecordType> => ({ record, inserted });

export const createIdGenerator = (prefix: string) => {
  let index = 0;
  return {
    next: (kind: string): string => {
      index += 1;
      return `${prefix}_${kind}_${index.toString().padStart(4, "0")}`;
    },
  };
};
