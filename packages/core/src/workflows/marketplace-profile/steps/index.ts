import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MercurModules, StoreOnboardingDraftStatus } from "@mercurjs/types"
import type {
  CreateStoreProfileDTO,
  CreateStoreOrderStatusDTO,
  CreateStoreLocationDetailDTO,
} from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"

export const createStoreProfileStep = createStep(
  "create-store-profile",
  async (input: CreateStoreProfileDTO, { container }) => {
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    const created = await service.createStoreProfiles(input)
    return new StepResponse(created, created.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    await service.deleteStoreProfiles(id)
  }
)

export const createStoreOrderStatusesStep = createStep(
  "create-store-order-statuses",
  async (input: CreateStoreOrderStatusDTO[], { container }) => {
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    const created = await service.createStoreOrderStatuses(input)
    return new StepResponse(
      created,
      created.map((s) => s.id)
    )
  },
  async (ids, { container }) => {
    if (!ids?.length) {
      return
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    await service.deleteStoreOrderStatuses(ids)
  }
)

type FinalizeStoreExtrasInput = {
  store_profile_id: string
  payment?: {
    online_enabled?: boolean
    payment_provider_id?: string | null
    cod_enabled?: boolean
    cod_min_amount?: number | null
    cod_max_amount?: number | null
    currency_code?: string | null
  } | null
  order_statuses?: Omit<CreateStoreOrderStatusDTO, "store_profile_id">[] | null
}

/**
 * Apply the store_profile's child data during draft submit: upsert the 1:1
 * payment config and (optionally) replace the seeded order statuses. No own
 * compensation needed — if a later step fails, createStoreProfileStep's
 * compensation deletes the store_profile and cascades to these children.
 */
export const finalizeStoreExtrasStep = createStep(
  "finalize-store-extras",
  async (input: FinalizeStoreExtrasInput, { container }) => {
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )

    if (input.payment) {
      const [existing] = await service.listStorePaymentConfigs({
        store_profile_id: input.store_profile_id,
      })
      if (existing) {
        await service.updateStorePaymentConfigs({
          id: existing.id,
          ...input.payment,
        })
      } else {
        await service.createStorePaymentConfigs({
          store_profile_id: input.store_profile_id,
          ...input.payment,
        })
      }
    }

    if (input.order_statuses?.length) {
      const existing = await service.listStoreOrderStatuses({
        store_profile_id: input.store_profile_id,
      })
      if (existing.length) {
        await service.deleteStoreOrderStatuses(existing.map((e) => e.id))
      }
      await service.createStoreOrderStatuses(
        input.order_statuses.map((s) => ({
          ...s,
          store_profile_id: input.store_profile_id,
        }))
      )
    }

    return new StepResponse(null)
  }
)

export const createStoreLocationDetailsStep = createStep(
  "create-store-location-details",
  async (input: CreateStoreLocationDetailDTO[], { container }) => {
    if (!input.length) {
      return new StepResponse([], [])
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    const created = await service.createStoreLocationDetails(input)
    return new StepResponse(
      created,
      created.map((d) => d.id)
    )
  },
  async (ids, { container }) => {
    if (!ids?.length) {
      return
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    await service.deleteStoreLocationDetails(ids)
  }
)

export const markDraftSubmittedStep = createStep(
  "mark-draft-submitted",
  async (input: { draft_id: string; seller_id: string }, { container }) => {
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    const before = await service.retrieveStoreOnboardingDraft(input.draft_id)
    await service.updateStoreOnboardingDrafts({
      id: input.draft_id,
      status: StoreOnboardingDraftStatus.SUBMITTED,
      submitted_seller_id: input.seller_id,
    })
    return new StepResponse(input.draft_id, {
      id: input.draft_id,
      prev_status: before.status as StoreOnboardingDraftStatus,
      prev_seller: before.submitted_seller_id,
    })
  },
  async (rollback, { container }) => {
    if (!rollback) {
      return
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    await service.updateStoreOnboardingDrafts({
      id: rollback.id,
      status: rollback.prev_status,
      submitted_seller_id: rollback.prev_seller,
    })
  }
)

export const upsertMemberProfileStep = createStep(
  "upsert-member-profile",
  async (input: { member_id: string; handle: string }, { container }) => {
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    const [existing] = await service.listMemberProfiles({
      member_id: input.member_id,
    })

    if (existing) {
      const updated = await service.updateMemberProfiles({
        id: existing.id,
        handle: input.handle,
      })
      return new StepResponse(updated, { id: existing.id, created: false })
    }

    const created = await service.createMemberProfiles({
      member_id: input.member_id,
      handle: input.handle,
    })
    return new StepResponse(created, { id: created.id, created: true })
  },
  async (rollback, { container }) => {
    if (!rollback?.created) {
      return
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    await service.deleteMemberProfiles(rollback.id)
  }
)
