import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@happilee-app/tokens/tokens.css";
import "@happilee-app/ui/styles.css";
import "@mercurjs/vendor/index.css";
import "@/styles/globals.css";
import App from "@mercurjs/vendor";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
