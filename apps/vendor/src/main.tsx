import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@mercurjs/vendor/index.css";
import App from "@mercurjs/vendor";

declare const __BACKEND_URL__: string;

// ── Happilee SSO handshake ────────────────────────────────────────────────────
// Converts the Happilee JWT into a Medusa session cookie, then lets the user
// pick their store manually on the /store-select page.
async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const ssoToken = params.get("sso_token");

  if (ssoToken) {
    window.localStorage.setItem("medusa_auth_token", ssoToken);

    try {
      // Convert JWT → connect.sid session cookie
      await fetch(`${__BACKEND_URL__}/auth/session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ssoToken}` },
        credentials: "include",
      });
    } catch {
      // Non-fatal — App redirects to login if session is missing
    }

    // Redirect to store-select so the user picks their store manually
    window.history.replaceState({}, "", "/store-select");
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap();
// ─────────────────────────────────────────────────────────────────────────────
