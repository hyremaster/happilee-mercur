import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MercurModules } from "@mercurjs/types"
import type {
  CreateStoreProfileDTO,
  CreateStoreOrderStatusDTO,
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
