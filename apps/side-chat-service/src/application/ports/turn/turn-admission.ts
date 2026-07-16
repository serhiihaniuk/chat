export interface TurnAdmissionLease {
  release(): Promise<void>;
}

export type TurnAdmissionOptions = Readonly<{
  signal?: AbortSignal | undefined;
}>;

export interface TurnAdmission {
  admitTurn(conversationId: string, options?: TurnAdmissionOptions): Promise<TurnAdmissionLease>;
}
