import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { MedusaError } from "@medusajs/framework/utils"
import { MercurModules, StoreOnboardingDraftStatus } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../modules/marketplace-profile/service"
import { VendorCreateDraftType } from "../validators"

// GET /vendor/store-onboarding/drafts — list the member's drafts (resume picker).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const authIdentityId = req.auth_context?.auth_identity_id
  if (!authIdentityId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "You must be authenticated."
    )
  }

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const rawStatus = req.query.status
  const statusFilter: string | string[] =
    typeof rawStatus === "string"
      ? rawStatus
      : Array.isArray(rawStatus)
        ? (rawStatus as string[])
        : StoreOnboardingDraftStatus.DRAFT

  const [drafts, count] = await service.listAndCountStoreOnboardingDrafts(
    { auth_identity_id: authIdentityId, status: statusFilter },
    {
      skip: req.queryConfig.pagination.skip,
      take: req.queryConfig.pagination.take,
      order: { updated_at: "DESC" },
    }
  )

  res.json({
    drafts,
    count,
    offset: req.queryConfig.pagination.skip,
    limit: req.queryConfig.pagination.take,
  })
}

// POST /vendor/store-onboarding/drafts — start a new draft.
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreateDraftType>,
  res: MedusaResponse
) => {
  const authIdentityId = req.auth_context?.auth_identity_id
  if (!authIdentityId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "You must be authenticated to start onboarding."
    )
  }

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const draft = await service.createStoreOnboardingDrafts({
    auth_identity_id: authIdentityId,
    draft_data: req.validatedBody.draft_data ?? null,
    onboarding_step: req.validatedBody.onboarding_step ?? 0,
    status: StoreOnboardingDraftStatus.DRAFT,
  })

  res.status(201).json({ draft })
}
