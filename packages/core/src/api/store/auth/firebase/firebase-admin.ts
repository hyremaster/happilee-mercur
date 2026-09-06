import admin from "firebase-admin"
import { MedusaError } from "@medusajs/framework/utils"

// Lazily-initialized singleton Firebase Admin app. Payment/auth providers live
// as singletons; one app is enough and initializing on first use keeps boot
// working in environments where Firebase isn't configured.
let cachedApp: admin.app.App | null = null

function getFirebaseApp(): admin.app.App {
  if (cachedApp) {
    return cachedApp
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  // Private keys are stored with escaped newlines in env; restore them.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")

  if (!projectId || !clientEmail || !privateKey) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Firebase auth is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
    )
  }

  cachedApp = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      })

  return cachedApp
}

/**
 * Verify a Firebase ID token and return the verified phone number.
 *
 * Firebase (client SDK) owns the SMS OTP send + verify; the backend only trusts
 * the resulting signed ID token. verifyIdToken checks the signature against
 * Google's public keys, the audience (= our project), and expiry. We further
 * require a phone sign-in so an email/Google Firebase token can't mint a phone
 * account.
 *
 * @throws MedusaError UNAUTHORIZED for an invalid/expired/non-phone token.
 */
export async function verifyFirebaseIdToken(
  idToken: string
): Promise<{ phone: string }> {
  let decoded: admin.auth.DecodedIdToken
  try {
    decoded = await getFirebaseApp().auth().verifyIdToken(idToken)
  } catch {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Invalid or expired Firebase token."
    )
  }

  const signInProvider = (
    decoded.firebase as { sign_in_provider?: string } | undefined
  )?.sign_in_provider

  if (signInProvider !== "phone" || !decoded.phone_number) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Firebase token is not a verified phone sign-in."
    )
  }

  return { phone: decoded.phone_number }
}
