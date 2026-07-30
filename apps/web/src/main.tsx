import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./shadcn.css";
import "./dashboard.css";
import "@xyflow/react/dist/style.css";
import "./scenario-workflow.css";
import { App } from "./app";

const container = document.getElementById("root");

if (!container) throw new Error("Missing #root mount element");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
