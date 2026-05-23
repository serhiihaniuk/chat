import type { ButtonHTMLAttributes, ReactElement } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = (props: ButtonProps): ReactElement => (
  <button className="side-chat-button" {...props} />
);
