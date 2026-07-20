import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import "./app.css";

const mount = document.getElementById("root");
if (!mount) throw new Error("The docs app requires a #root mount element.");

createRoot(mount).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
