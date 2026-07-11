export interface TurnAdmissionLease {
  release(): Promise<void>;
}

export interface TurnAdmission {
  admitTurn(conversationId: string): Promise<TurnAdmissionLease>;
}
