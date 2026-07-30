import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./shadcn.css";
import "./e2e-flow.css";
import "./dashboard.css";
import { App } from "./app";

const container = document.getElementById("root");

if (!container) throw new Error("Missing #root mount element");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
