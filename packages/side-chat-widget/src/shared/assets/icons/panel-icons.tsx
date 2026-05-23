import type { ReactElement } from "react";

export const NewChatIcon = (): ReactElement => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M5 19h14" />
    <path d="M7 17V5h10v8" />
    <path d="M13 17l6-6" />
    <path d="M15 11h4v4" />
  </svg>
);

export const SettingsIcon = (): ReactElement => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3" />
    <path d="M12 18v3" />
    <path d="M3 12h3" />
    <path d="M18 12h3" />
    <path d="M5.6 5.6l2.1 2.1" />
    <path d="M16.3 16.3l2.1 2.1" />
    <path d="M18.4 5.6l-2.1 2.1" />
    <path d="M7.7 16.3l-2.1 2.1" />
  </svg>
);

export const ExpandIcon = (): ReactElement => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M8 4H4v4" />
    <path d="M4 4l6 6" />
    <path d="M16 20h4v-4" />
    <path d="M20 20l-6-6" />
  </svg>
);

export const CloseIcon = (): ReactElement => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </svg>
);
