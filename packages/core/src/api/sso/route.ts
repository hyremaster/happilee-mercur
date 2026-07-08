import jwt from "jsonwebtoken"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
  generateJwtToken,
  MedusaError,
} from "@medusajs/framework/utils"
import { MercurModules, SellerRole, StoreOnboardingDraftStatus } from "@mercurjs/types"

import type SellerModuleService from "../../modules/seller/service"
import type MarketplaceProfileModuleService from "../../modules/marketplace-profile/service"
import { ssoAddMemberToSellerWorkflow } from "../../workflows/seller/workflows/sso-add-member-to-seller"
import { ssoCreateMemberWorkflow } from "../../workflows/seller/workflows/sso-create-member"

interface HappileeSSOPayload {
  project_id: string
  user_id: string
  email: string
  name: string
  organization?: string
  phone?: string
}

async function ensureProjectDraft(
  service: MarketplaceProfileModuleService,
  authIdentityId: string,
  externalId: string,
  businessDraftData: Record<string, unknown>
) {
  const [existing] = await service.listStoreOnboardingDrafts(
    {
      auth_identity_id: authIdentityId,
      status: StoreOnboardingDraftStatus.DRAFT,
      metadata: { happilee_external_id: externalId },
    } as Record<string, unknown>,
    { take: 1 }
  )
  if (existing) return

  await service.createStoreOnboardingDrafts({
    auth_identity_id: authIdentityId,
    draft_data: { business: businessDraftData },
    onboarding_step: 1,
    status: StoreOnboardingDraftStatus.DRAFT,
    metadata: { happilee_external_id: externalId },
  })
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

  const { project_id, email, name, organization, phone } = payload

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const authService = req.scope.resolve(Modules.AUTH)
  const sellerService = req.scope.resolve<SellerModuleService>(MercurModules.SELLER)
  const marketplaceProfileService = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  const config = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const { http } = config.projectConfig

  const externalId = `happilee_${project_id}`
  const storeName = organization || name
  const nameParts = name.trim().split(/\s+/)
  const firstName = nameParts[0]
  const lastName = nameParts.slice(1).join(" ") || undefined

  // Business-level data from Happilee payload — seeded into step-1 draft_data
  const businessDraftData = {
    name: storeName,
    email,
    ...(phone ? { phone } : {}),
  }

  // Look up seller (project) and member (user) independently
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id"],
    filters: { external_id: externalId },
  })

  const { data: members } = await query.graph({
    entity: "member",
    fields: ["id", "metadata"],
    filters: { email },
  })

  const existingSeller = sellers[0] ?? null
  const existingMember = members[0] ?? null

  let memberId: string
  let authIdentityId: string

  if (!existingSeller && !existingMember) {
    // Case A: brand-new project, brand-new user — create member + draft (no seller yet)
    const [authIdentity] = await authService.createAuthIdentities([{}])
    authIdentityId = authIdentity.id

    const memberResult = await ssoCreateMemberWorkflow(req.scope).run({
      input: {
        auth_identity_id: authIdentityId,
        email,
        first_name: firstName,
        last_name: lastName ?? null,
      },
    })
    memberId = memberResult.result.id

    await sellerService.updateMembers([
      { id: memberId, metadata: { auth_identity_id: authIdentityId } },
    ])

    await ensureProjectDraft(
      marketplaceProfileService,
      authIdentityId,
      externalId,
      businessDraftData
    )

  } else if (!existingSeller && existingMember) {
    // Case B: new project, returning user — create draft only (member already has auth)
    memberId = existingMember.id
    authIdentityId = existingMember.metadata?.auth_identity_id as string

    if (!authIdentityId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "SSO member record is corrupted: no auth_identity_id in member metadata"
      )
    }

    await ensureProjectDraft(
      marketplaceProfileService,
      authIdentityId,
      externalId,
      businessDraftData
    )

  } else if (existingSeller && !existingMember) {
    // Case C: existing project, new user — create member and link to seller
    const sellerId = existingSeller.id

    const [authIdentity] = await authService.createAuthIdentities([{}])
    authIdentityId = authIdentity.id

    const result = await ssoAddMemberToSellerWorkflow(req.scope).run({
      input: {
        seller_id: sellerId,
        auth_identity_id: authIdentityId,
        email,
        first_name: firstName,
        last_name: lastName ?? null,
      },
    })
    memberId = result.result.id

    await sellerService.updateMembers([
      { id: memberId, metadata: { auth_identity_id: authIdentityId } },
    ])

  } else {
    // Case D: returning user, existing project — ensure seller_member link exists
    memberId = existingMember!.id
    authIdentityId = existingMember!.metadata?.auth_identity_id as string

    if (!authIdentityId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "SSO member record is corrupted: no auth_identity_id in member metadata"
      )
    }

    const sellerId = existingSeller!.id
    const existingLinks = await sellerService.listSellerMembers(
      { seller_id: sellerId, member_id: memberId },
      { take: 1 }
    )
    if (existingLinks.length === 0) {
      const owners = await sellerService.listSellerMembers(
        { seller_id: sellerId, is_owner: true },
        { take: 1 }
      )
      await sellerService.createSellerMembers([
        {
          seller_id: sellerId,
          member_id: memberId,
          role_id: SellerRole.SELLER_ADMINISTRATION,
          is_owner: owners.length === 0,
        },
      ])
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

  return res.redirect(`${vendorUrl}/stores?sso_token=${mercurToken}`)
}

export const POST = GET
