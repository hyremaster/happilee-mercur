import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@happilee-app/tokens/tokens.css";
import "@happilee-app/ui/styles.css";
import "leaflet/dist/leaflet.css";
import "@mercurjs/vendor/index.css";
import "@/styles/globals.css";
import App from "@mercurjs/vendor";

declare const __BACKEND_URL__: string;

// ── Happilee SSO handshake ────────────────────────────────────────────────────
// The @mercurjs/vendor App uses session-based auth (connect.sid cookie).
// On a normal login the App runs this sequence automatically:
//   1. POST /auth/session          → converts JWT to connect.sid cookie
//   2. GET  /vendor/sellers        → lists sellers the member belongs to
//   3. POST /vendor/sellers/select → binds a seller to the session
// Without step 3 every /vendor/* route returns "x-seller-id header is required".
// We replicate all three steps here before the App mounts.
async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const ssoToken = params.get("sso_token");

  if (ssoToken) {
    window.localStorage.setItem("medusa_auth_token", ssoToken);

    try {
      // Step 1 — convert JWT → session cookie
      const sessionRes = await fetch(`${__BACKEND_URL__}/auth/session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ssoToken}` },
        credentials: "include",
      });

      if (sessionRes.ok) {
        // Step 2 — fetch the sellers this member belongs to
        const sellersRes = await fetch(`${__BACKEND_URL__}/vendor/sellers`, {
          credentials: "include",
        });

        if (sellersRes.ok) {
          const { seller_members } = await sellersRes.json();

          // Step 3 — select the first (and for SSO users, only) seller
          if (seller_members?.length > 0) {
            await fetch(`${__BACKEND_URL__}/vendor/sellers/select`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ seller_id: seller_members[0].seller_id }),
            });
          }
        }
      }
    } catch {
      // Non-fatal — the App will redirect to login if the session is missing
    }

    // Strip token from URL
    params.delete("sso_token");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (qs ? "?" + qs : "")
    );
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap();
// ─────────────────────────────────────────────────────────────────────────────
