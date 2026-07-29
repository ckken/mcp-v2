import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./actions.css";
import { App } from "./app";

const container = document.getElementById("root");

if (!container) throw new Error("Missing #root mount element");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
