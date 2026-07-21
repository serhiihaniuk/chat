import type { ReactElement } from "react";

import { ChevronLeft, X } from "lucide-react";

import { SettingsPanel } from "@side-chat/side-chat-widget/ui/settings";

export function SettingsPreview(): ReactElement {
  return (
    <div className="sc-settings-frame sc-settings-frame-wide">
      <div className="sc-settings-header">
        <span className="sc-settings-header-icon">
          <ChevronLeft size={18} strokeWidth={1.8} />
        </span>
        <span className="sc-settings-header-title">Settings</span>
        <span className="sc-settings-header-icon">
          <X size={18} strokeWidth={1.8} />
        </span>
      </div>
      <SettingsPanel />
    </div>
  );
}
