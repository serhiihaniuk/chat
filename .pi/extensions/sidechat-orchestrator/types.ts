export type ExecResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly killed?: boolean;
};

export type ToolContent = {
  readonly type: "text";
  readonly text: string;
};

export type ToolResult<TDetails = unknown> = {
  readonly content: readonly ToolContent[];
  readonly details: TDetails;
  readonly isError?: boolean;
};

export type ToolContext = {
  readonly cwd: string;
};

export type ToolUpdate<TDetails = unknown> = (update: ToolResult<TDetails>) => void;

export type RegisteredTool<TParams, TDetails> = {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly promptSnippet?: string;
  readonly promptGuidelines?: readonly string[];
  readonly parameters: unknown;
  execute(
    toolCallId: string,
    params: TParams,
    signal: AbortSignal,
    onUpdate: ToolUpdate<TDetails> | undefined,
    ctx: ToolContext,
  ): Promise<ToolResult<TDetails>>;
};

export type SidechatPiAPI = {
  registerTool<TParams, TDetails>(tool: RegisteredTool<TParams, TDetails>): void;
  exec(
    command: string,
    args: readonly string[],
    options?: {
      readonly cwd?: string;
      readonly signal?: AbortSignal;
      readonly timeout?: number;
    },
  ): Promise<ExecResult>;
};
