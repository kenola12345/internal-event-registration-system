import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/app";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element is missing in index.html");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
