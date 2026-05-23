export type ChatClientErrorCode =
  | "http_error"
  | "network_error"
  | "aborted"
  | "malformed_stream"
  | "missing_terminal";

export type ChatClientErrorOptions = {
  readonly cause?: unknown;
  readonly status?: number;
  readonly attempt?: number;
};

export class ChatClientError extends Error {
  readonly code: ChatClientErrorCode;
  readonly status?: number;
  readonly attempt?: number;

  constructor(
    code: ChatClientErrorCode,
    message: string,
    options: ChatClientErrorOptions = {},
  ) {
    super(message, withCause(options.cause));
    this.name = "ChatClientError";
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.attempt !== undefined) this.attempt = options.attempt;
  }
}

const withCause = (cause: unknown): ErrorOptions | undefined =>
  cause === undefined ? undefined : { cause };
