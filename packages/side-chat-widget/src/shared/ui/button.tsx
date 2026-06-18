/**
 * §8.7 — Button.
 *
 * Text buttons are pure tier-1 utilities on a plain <button>, so `hover:` and
 * `focus-visible:` are allowed here (gate G4 only forbids those on Base UI parts).
 * The icon button is a square hit-target carried by the `sc-icon-btn` hook class,
 * which also owns its `popupopen:` reaction when wired as a Base UI menu trigger.
 */
import type { ButtonHTMLAttributes, ReactElement } from "react";
import { Plus, Settings } from "lucide-react";

import { cn } from "#shared/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
type ButtonSize = "default" | "sm" | "icon" | "icon-sm" | "icon-xs";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-card text-foreground border border-border hover:bg-accent",
  ghost: "bg-transparent text-muted-foreground hover:bg-accent",
  outline: "bg-card text-foreground border border-border hover:bg-accent",
};

const sizes: Record<ButtonSize, string> = {
  default: "px-3 py-2",
  sm: "px-2.5 py-1.5",
  icon: "size-control p-0",
  "icon-sm": "size-8 p-0",
  "icon-xs": "size-7 p-0",
};

export function Button({
  variant = "primary",
  size = "default",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
}): ReactElement {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

export function IconButton({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  "aria-label": string;
}): ReactElement {
  return <button type={type} className={cn("sc-icon-btn", className)} {...props} />;
}

export function ButtonSection(): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">
        <Plus className="size-4" />
        Primary
      </Button>
      <Button variant="secondary">
        <Settings className="size-4" />
        Secondary
      </Button>
      <Button variant="ghost">
        <Plus className="size-4" />
        Ghost
      </Button>
      <Button variant="primary" disabled>
        <Plus className="size-4" />
        Disabled
      </Button>
      <IconButton aria-label="Settings">
        <Settings className="size-4" />
      </IconButton>
      <IconButton aria-label="New chat">
        <Plus className="size-4" />
      </IconButton>
    </div>
  );
}
