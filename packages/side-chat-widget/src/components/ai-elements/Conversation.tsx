import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { forwardRef } from "react";

export const Conversation = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div">
>(function Conversation({ children, className, ...props }, ref) {
  const classNames = ["sidechat-conversation", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={ref}
      className={classNames}
      {...props}
      role="log"
      aria-live="polite"
    >
      {children}
    </div>
  );
});

export function Message({
  role,
  children,
}: {
  role: "user" | "assistant" | "system";
  children: ReactNode;
}) {
  return (
    <article
      className={`sidechat-message sidechat-message-${role}`}
      data-role={role}
    >
      {children}
    </article>
  );
}
