import type {
  ClaimClientToolAbortCommand,
  ClaimClientToolDispatchResult,
  ClaimClientToolTimeoutCommand,
  CreateClientToolDispatchCommand,
  FindClientToolDispatchCommand,
  RepositoryCommandResult,
  SubmitClientToolOutputCommand,
  SubmitClientToolOutputResult,
} from "../repositories.js";
import type { ClientToolDispatchRecord } from "../entities.js";

/** Atomic persistence operations for the durable client-tool wait lifecycle. */
export type ClientToolDispatchRepositoryContract = {
  readonly createClientToolDispatch: (
    command: CreateClientToolDispatchCommand,
  ) => Promise<RepositoryCommandResult<ClientToolDispatchRecord>>;
  readonly findClientToolDispatch: (
    command: FindClientToolDispatchCommand,
  ) => Promise<ClientToolDispatchRecord | undefined>;
  readonly submitClientToolOutput: (
    command: SubmitClientToolOutputCommand,
  ) => Promise<SubmitClientToolOutputResult | undefined>;
  readonly claimClientToolTimeout: (
    command: ClaimClientToolTimeoutCommand,
  ) => Promise<ClaimClientToolDispatchResult | undefined>;
  readonly claimClientToolAbort: (
    command: ClaimClientToolAbortCommand,
  ) => Promise<ClaimClientToolDispatchResult | undefined>;
};
