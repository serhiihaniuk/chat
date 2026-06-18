import "@side-chat/side-chat-widget/styles.css";

import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { ComponentShowcase } from "@side-chat/side-chat-widget/showcase";

// Greenfield rebuild: the harness now renders the component showcase (every
// primitive + composition of the build contract on one page) instead of the
// throwaway widget. createElement avoids JSX in this .ts entry file.
const container = document.getElementById("root");
if (container) {
  createRoot(container).render(createElement(ComponentShowcase));
}
