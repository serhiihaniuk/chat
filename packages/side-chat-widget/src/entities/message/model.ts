export type WidgetMessage = {
  readonly content: string;
  readonly id: string;
  readonly role: "assistant" | "system" | "user";
  readonly sequence: number;
};
