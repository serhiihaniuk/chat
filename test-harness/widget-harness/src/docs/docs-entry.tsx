import "@side-chat/side-chat-widget/styles.css";

import { createRoot } from "react-dom/client";

import { DocsApp } from "@side-chat/side-chat-widget/docs";

// Separate page (docs.html) from the widget harness root: this mounts the React
// component documentation site (the migration of design_widget.html). The widget
// harness `/` keeps rendering the real assembled widget.
const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<DocsApp />);
}
