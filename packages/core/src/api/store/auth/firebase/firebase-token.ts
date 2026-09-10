import jwt, { JwtHeader } from "jsonwebtoken"
import { MedusaError } from "@medusajs/framework/utils"

/**
 * Verify a Firebase phone-auth ID token WITHOUT the Admin SDK / service account.
 *
 * A Firebase ID token is a standard RS256 JWT signed by Google's Secure Token
 * service. We verify it against Google's public x509 certs and check the
 * standard claims. This needs only the (public) FIREBASE_PROJECT_ID — no
 * client_email / private_key secret.
 */

// Google's public signing certs for Firebase ID tokens.
const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

type CertMap = Record<string, string>

// Cache the certs until their Cache-Control max-age expires (Google rotates
// them). Refetched on expiry or when a token's kid is missing.
let certCache: { certs: CertMap; expiresAt: number } | null = null

async function getGoogleCerts(forceRefresh = false): Promise<CertMap> {
  const now = Date.now()
  if (!forceRefresh && certCache && certCache.expiresAt > now) {
    return certCache.certs
  }

  let res: Response
  try {
    res = await fetch(CERTS_URL)
  } catch (e) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Failed to reach Google to fetch Firebase signing certs: ${
        (e as Error).message
      }`
    )
  }
  if (!res.ok) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Failed to fetch Firebase signing certs (status ${res.status}).`
    )
  }

  const certs = (await res.json()) as CertMap
  const cacheControl = res.headers.get("cache-control") ?? ""
  const maxAge = cacheControl.match(/max-age=(\d+)/)
  const maxAgeMs = (maxAge ? parseInt(maxAge[1], 10) : 3600) * 1000
  certCache = { certs, expiresAt: now + maxAgeMs }
  return certs
}

type FirebaseIdTokenClaims = {
  sub?: string
  phone_number?: string
  firebase?: { sign_in_provider?: string }
}

/**
 * Verify a Firebase ID token and return the verified phone number.
 * Firebase (client SDK) owns the SMS OTP send + verify; the backend only trusts
 * the resulting signed token. We check signature, audience (= project id),
 * issuer and expiry, and require a phone sign-in.
 *
 * @throws MedusaError UNAUTHORIZED for an invalid/expired/non-phone token.
 */
export async function verifyFirebaseIdToken(
  idToken: string
): Promise<{ phone: string }> {
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Firebase auth is not configured. Set FIREBASE_PROJECT_ID."
    )
  }

  const decoded = jwt.decode(idToken, { complete: true })
  const kid = (decoded?.header as JwtHeader | undefined)?.kid
  if (!decoded || !kid) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Invalid Firebase token."
    )
  }

  // Pick the cert for this token's key id; refetch once if it's unknown (key
  // rotation).
  let certs = await getGoogleCerts()
  if (!certs[kid]) {
    certs = await getGoogleCerts(true)
  }
  const cert = certs[kid]
  if (!cert) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Firebase token signed with an unknown key."
    )
  }

  let claims: FirebaseIdTokenClaims
  try {
    claims = jwt.verify(idToken, cert, {
      algorithms: ["RS256"],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    }) as FirebaseIdTokenClaims
  } catch {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Invalid or expired Firebase token."
    )
  }

  if (!claims.sub) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Invalid Firebase token."
    )
  }
  if (claims.firebase?.sign_in_provider !== "phone" || !claims.phone_number) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Firebase token is not a verified phone sign-in."
    )
  }

  return { phone: claims.phone_number }
}
