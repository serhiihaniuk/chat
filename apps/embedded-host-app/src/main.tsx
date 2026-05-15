import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

import "@side-chat/side-chat-widget/styles.css";
import "./styles.css";

const hostRoot = document.getElementById("root");
if (hostRoot) {
  createRoot(hostRoot).render(<App />);
}
