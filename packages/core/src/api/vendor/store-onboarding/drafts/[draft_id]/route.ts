import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { MedusaError } from "@medusajs/framework/utils"
import { MercurModules, StoreOnboardingDraftStatus } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"
import {
  assertDraftOwnership,
  sanitizeDraft,
  validateDraftPaymentGateways,
} from "../../helpers"
import { VendorSaveDraftStepType } from "../../validators"

// Wizard screen index -> draft_data key.
const STEP_KEY: Record<number, string> = {
  1: "business",
  2: "commerce",
  3: "fulfillment",
  4: "storefront",
}

// GET /vendor/store-onboarding/drafts/:draft_id — resume a draft.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const draft = await assertDraftOwnership(req, req.params.draft_id)
  res.json({ draft: sanitizeDraft(draft) })
}

// POST /vendor/store-onboarding/drafts/:draft_id — save one screen.
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorSaveDraftStepType>,
  res: MedusaResponse
) => {
  const draft = await assertDraftOwnership(req, req.params.draft_id)

  if (draft.status === StoreOnboardingDraftStatus.SUBMITTED) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This draft has already been submitted."
    )
  }

  const { step, data } = req.validatedBody
  const key = STEP_KEY[step]

  // Step 3 (fulfillment) may carry payment-gateway credentials. Verify them
  // against the provider before persisting so a draft never stores creds that
  // don't authenticate.
  if (step === 3) {
    await validateDraftPaymentGateways(data)
  }

  const nextDraftData = {
    ...(draft.draft_data ?? {}),
    [key]: data,
  }

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const updated = await service.updateStoreOnboardingDrafts({
    id: draft.id,
    draft_data: nextDraftData,
    onboarding_step: Math.max(draft.onboarding_step ?? 0, step),
  })

  res.json({ draft: sanitizeDraft(updated) })
}

// DELETE /vendor/store-onboarding/drafts/:draft_id — discard a draft.
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const draft = await assertDraftOwnership(req, req.params.draft_id)

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  await service.deleteStoreOnboardingDrafts(draft.id)

  res.json({ id: draft.id, object: "store_onboarding_draft", deleted: true })
}
