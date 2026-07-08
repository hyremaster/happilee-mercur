import { model } from "@medusajs/framework/utils"
import { StoreOnboardingDraftStatus } from "@mercurjs/types"

/**
 * In-progress store-onboarding wizard, persisted per owner member.
 *
 * Each "Continue" merges that screen's payload into `draft_data` and advances
 * `onboarding_step`. No Seller / StockLocation / store_profile is created until
 * the draft is submitted — so abandoning a draft has zero side effects. The
 * owner is keyed by `auth_identity_id` (not member_id) because a first-time
 * vendor has no Member until submit. One identity can hold multiple concurrent
 * drafts (the column is indexed, not unique).
 */
const StoreOnboardingDraft = model
  .define("StoreOnboardingDraft", {
    id: model.id({ prefix: "sodraft" }).primaryKey(),
    auth_identity_id: model.text(),
    draft_data: model.json().nullable(),
    onboarding_step: model.number().default(0),
    status: model
      .enum(StoreOnboardingDraftStatus)
      .default(StoreOnboardingDraftStatus.DRAFT),
    submitted_seller_id: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_store_onboarding_draft_auth_identity_id",
      on: ["auth_identity_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_store_onboarding_draft_status",
      on: ["status"],
      where: "deleted_at IS NULL",
    },
  ])

export default StoreOnboardingDraft
