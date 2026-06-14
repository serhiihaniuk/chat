export type ClockPort = {
  readonly now: () => string;
};

export type IdGeneratorPort = {
  readonly nextConversationId: () => string;
  readonly nextEventId: () => string;
};
