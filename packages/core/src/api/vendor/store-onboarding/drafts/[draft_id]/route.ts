import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { MedusaError } from "@medusajs/framework/utils"
import { MercurModules, StoreOnboardingDraftStatus } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"
import {
  assertDraftOwnership,
  maskDraftData,
  mergePaymentGatewaySecrets,
} from "../../helpers"
import { VendorSaveDraftStepType } from "../../validators"

// Wizard screen index -> draft_data key.
const STEP_KEY: Record<number, string> = {
  1: "business",
  2: "commerce",
  3: "fulfillment",
  4: "storefront",
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v)

// GET /vendor/store-onboarding/drafts/:draft_id — resume a draft.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const draft = await assertDraftOwnership(req, req.params.draft_id)
  res.json({ draft: { ...draft, draft_data: maskDraftData(draft.draft_data) } })
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
  let stepData: Record<string, unknown> = { ...data }

  if (step === 3) {
    const previousDraft = isObject(draft.draft_data) ? draft.draft_data : {}
    const previousFulfillment = isObject(previousDraft.fulfillment)
      ? previousDraft.fulfillment
      : {}

    stepData = {
      ...stepData,
      payment_gateways: mergePaymentGatewaySecrets(
        stepData.payment_gateways,
        previousFulfillment.payment_gateways
      ),
    }
  }

  const nextDraftData = {
    ...(draft.draft_data ?? {}),
    [key]: stepData,
  }

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const updated = await service.updateStoreOnboardingDrafts({
    id: draft.id,
    draft_data: nextDraftData,
    onboarding_step: Math.max(draft.onboarding_step ?? 0, step),
  })

  res.json({
    draft: { ...updated, draft_data: maskDraftData(updated.draft_data) },
  })
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
