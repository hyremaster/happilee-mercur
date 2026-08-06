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
  // Per-project Happilee (Area Sense) API key. Secret — consumed server-side
  // only, persisted to the draft/store_profile, never re-emitted to the SPA.
  api_key?: string
  // JWT id — required when `api_key` is present so a captured token cannot be
  // replayed (the key rides a browser-redirect URL). Enforced one-time-use.
  jti?: string
  iat?: number
  exp?: number
}

// One-time-use window for a key-bearing SSO token. The token is also bounded by
// `jwt.verify({ maxAge })`; the consumed-jti cache TTL matches so a replayed
// token is rejected for as long as it could otherwise still verify.
const SSO_MAX_AGE_SECONDS = Number(
  process.env.HAPPILEE_SSO_MAX_AGE_SECONDS || 300
)

async function ensureProjectDraft(
  service: MarketplaceProfileModuleService,
  authIdentityId: string,
  externalId: string,
  businessDraftData: Record<string, unknown>,
  apiKey?: string
) {
  const [existing] = await service.listStoreOnboardingDrafts(
    {
      auth_identity_id: authIdentityId,
      status: StoreOnboardingDraftStatus.DRAFT,
      metadata: { happilee_external_id: externalId },
    } as Record<string, unknown>,
    { take: 1 }
  )
  if (existing) {
    // Idempotent re-entry: refresh the key if it rotated. Never clear it when
    // the token omits one.
    if (apiKey && existing.happilee_api_key !== apiKey) {
      await service.updateStoreOnboardingDrafts({
        id: existing.id,
        happilee_api_key: apiKey,
      })
    }
    return
  }

  await service.createStoreOnboardingDrafts({
    auth_identity_id: authIdentityId,
    draft_data: { business: businessDraftData },
    onboarding_step: 1,
    status: StoreOnboardingDraftStatus.DRAFT,
    happilee_api_key: apiKey ?? null,
    metadata: { happilee_external_id: externalId },
  })
}

/**
 * Persist the Happilee API key on an existing seller's store_profile (SSO cases
 * where the seller already exists, so there is no draft to carry it). Upserts
 * the profile when absent, mirroring the vendor store-detail route. No-op when
 * the token carried no key.
 */
async function upsertStoreProfileApiKey(
  service: MarketplaceProfileModuleService,
  sellerId: string,
  apiKey?: string
) {
  if (!apiKey) return

  const [profile] = await service.listStoreProfiles({ seller_id: sellerId })
  if (profile) {
    if (profile.happilee_api_key !== apiKey) {
      await service.updateStoreProfiles({
        id: profile.id,
        happilee_api_key: apiKey,
      })
    }
  } else {
    await service.createStoreProfiles({
      seller_id: sellerId,
      happilee_api_key: apiKey,
    })
  }
}

/**
 * Bind the authorizing Happilee API key to the vendor's identity so a store the
 * vendor later creates *inside* the dashboard (no SSO token for that store) can
 * inherit it. Overwrites on each SSO — most recent login wins. Key stays
 * server-side; this entity is never returned to the SPA. No-op without a key.
 */
async function upsertIdentityKey(
  service: MarketplaceProfileModuleService,
  authIdentityId: string,
  projectId: string,
  apiKey?: string
) {
  if (!apiKey) return

  const [existing] = await service.listHappileeIdentityKeys(
    { auth_identity_id: authIdentityId },
    { take: 1 }
  )
  if (existing) {
    if (
      existing.happilee_api_key !== apiKey ||
      existing.project_id !== projectId
    ) {
      await service.updateHappileeIdentityKeys({
        id: existing.id,
        project_id: projectId,
        happilee_api_key: apiKey,
      })
    }
    return
  }

  await service.createHappileeIdentityKeys({
    auth_identity_id: authIdentityId,
    project_id: projectId,
    happilee_api_key: apiKey,
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
    // Bound the token lifetime: reject anything older than SSO_MAX_AGE_SECONDS
    // even if a long/absent `exp` was signed in. Small clock skew tolerated.
    payload = jwt.verify(token, ssoSecret, {
      maxAge: SSO_MAX_AGE_SECONDS,
      clockTolerance: 5,
    }) as HappileeSSOPayload
  } catch {
    return res.status(401).json({ error: "Invalid or expired SSO token" })
  }

  const {
    project_id,
    email,
    name,
    organization,
    phone,
    api_key: apiKey,
    jti,
  } = payload

  // A key-bearing token carries a secret through a browser-redirect URL, so it
  // must be single-use: require a jti and reject any replay within the token's
  // validity window.
  if (apiKey) {
    if (!jti) {
      return res
        .status(400)
        .json({ error: "SSO token carrying an api_key must include a jti" })
    }
    const cache = req.scope.resolve(Modules.CACHE)
    const consumedKey = `happilee_sso_jti:${jti}`
    if (await cache.get(consumedKey)) {
      return res.status(401).json({ error: "SSO token has already been used" })
    }
    await cache.set(consumedKey, "1", SSO_MAX_AGE_SECONDS)
  }

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
      businessDraftData,
      apiKey
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
      businessDraftData,
      apiKey
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

    await upsertStoreProfileApiKey(marketplaceProfileService, sellerId, apiKey)

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

    await upsertStoreProfileApiKey(marketplaceProfileService, sellerId, apiKey)
  }

  // Bind the authorizing key to this identity so stores the vendor creates
  // in-dashboard (no per-store SSO) inherit it. Server-side only.
  await upsertIdentityKey(
    marketplaceProfileService,
    authIdentityId,
    project_id,
    apiKey
  )

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
