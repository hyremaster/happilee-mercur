import jwt from "jsonwebtoken"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
  generateJwtToken,
  MedusaError,
} from "@medusajs/framework/utils"

import { createSellerAccountWorkflow } from "../../workflows/seller"

interface HappileeSSOPayload {
  project_id: string
  user_id: string
  email: string
  name: string
  organization?: string
  phone?: string
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { token } = req.query as { token?: string }

  if (!token) {
    return res.status(400).json({ error: "Missing SSO token" })
  }

  const ssoSecret = process.env.HAPPILEE_SSO_SECRET
  if (!ssoSecret) {
    return res.status(500).json({ error: "SSO not configured on this server" })
  }

  let payload: HappileeSSOPayload
  try {
    payload = jwt.verify(token, ssoSecret) as HappileeSSOPayload
  } catch {
    return res.status(401).json({ error: "Invalid or expired SSO token" })
  }

  const { project_id, email, name, organization } = payload

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const authService = req.scope.resolve(Modules.AUTH)
  const config = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const { http } = config.projectConfig

  const externalId = `happilee_${project_id}`

  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "metadata", "external_id"],
    filters: { external_id: externalId },
  })

  let authIdentityId: string
  let memberId: string

  if (sellers.length > 0 && sellers[0].metadata?.auth_identity_id) {
    // Returning seller
    authIdentityId = sellers[0].metadata.auth_identity_id as string
    const authIdentity = await authService.retrieveAuthIdentity(authIdentityId)
    memberId = authIdentity.app_metadata?.member_id as string

    if (!memberId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "SSO seller record is corrupted: no member_id in auth identity"
      )
    }
  } else {
    // First-time login — provision seller account
    const [authIdentity] = await authService.createAuthIdentities([{}])
    authIdentityId = authIdentity.id

    const nameParts = name.trim().split(/\s+/)
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(" ") || undefined

    await createSellerAccountWorkflow(req.scope).run({
      input: {
        auth_identity_id: authIdentityId,
        seller: {
          name: organization || name,
          email,
          external_id: externalId,
          currency_code: "usd",
          metadata: {
            happilee_project_id: project_id,
            auth_identity_id: authIdentityId,
          },
        },
        member_email: email,
        first_name: firstName,
        last_name: lastName,
      },
    })

    const updated = await authService.retrieveAuthIdentity(authIdentityId)
    memberId = updated.app_metadata?.member_id as string

    if (!memberId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Seller provisioning failed: workflow did not set member_id"
      )
    }
  }

  const mercurToken = generateJwtToken(
    {
      actor_id: memberId,
      actor_type: "member",
      auth_identity_id: authIdentityId,
      app_metadata: { member_id: memberId },
      user_metadata: {},
    },
    {
      secret: http.jwtSecret as string,
      expiresIn: (http.jwtExpiresIn as string) || "7d",
    }
  )

  const vendorUrl =
    process.env.MERCUR_VENDOR_URL?.replace(/\/$/, "") || "http://localhost:7001"

  return res.redirect(`${vendorUrl}/seller?sso_token=${mercurToken}`)
}

export const POST = GET
