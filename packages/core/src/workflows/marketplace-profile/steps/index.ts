import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  cancelOrderWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  MercurModules,
  StoreOnboardingDraftStatus,
  StoreOrderStatusType,
  StorePaymentGatewayType,
} from "@mercurjs/types"
import type {
  CreateStoreProfileDTO,
  CreateStoreOrderStatusDTO,
  CreateStoreOrderStatusEventDTO,
  CreateStoreLocationDetailDTO,
  CreateStoreDeliveryAreaDTO,
  StorePaymentGatewayCredentials,
} from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"
import { assertTransitionAllowed } from "../utils/order-status-transitions"
import { resolveOrderStoreStatusContext } from "../utils/resolve-order-store-status"

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

export const createStoreDeliveryAreasStep = createStep(
  "create-store-delivery-areas",
  async (input: CreateStoreDeliveryAreaDTO[], { container }) => {
    if (!input.length) {
      return new StepResponse([], [])
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    const created = await service.createStoreDeliveryAreas(input)
    return new StepResponse(
      created,
      created.map((a) => a.id)
    )
  },
  async (ids, { container }) => {
    if (!ids?.length) {
      return
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    await service.deleteStoreDeliveryAreas(ids)
  }
)

type UpsertPaymentGatewayInput = {
  seller_id: string
  gateway: StorePaymentGatewayType
  is_active?: boolean
  credentials: StorePaymentGatewayCredentials
  metadata?: Record<string, unknown> | null
} | null

type SyncPaymentGatewaysInput = {
  seller_id: string
  gateways: Array<{
    gateway: StorePaymentGatewayType
    is_active?: boolean
    credentials: StorePaymentGatewayCredentials
    metadata?: Record<string, unknown> | null
  }>
} | null

/**
 * Materialize a store's payment gateway (credentials) on draft submit. Upsert by
 * (seller_id, gateway). Seller-scoped, so it runs after the seller exists.
 * No-op when the draft carried no gateway.
 *
 * @deprecated Prefer syncStorePaymentGatewaysStep for multi-gateway payloads.
 */
export const upsertStorePaymentGatewayStep = createStep(
  "upsert-store-payment-gateway",
  async (input: UpsertPaymentGatewayInput, { container }) => {
    if (!input) {
      return new StepResponse(null, null)
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    const [existing] = await service.listStorePaymentGateways({
      seller_id: input.seller_id,
      gateway: input.gateway,
    })

    type Rollback =
      | { id: string; created: true }
      | {
          id: string
          created: false
          prev: {
            is_active: boolean
            credentials: Record<string, unknown>
            metadata: Record<string, unknown> | null
          }
        }

    if (existing) {
      await service.updateStorePaymentGateways({
        id: existing.id,
        is_active: input.is_active ?? existing.is_active,
        credentials: input.credentials,
        metadata: input.metadata ?? existing.metadata ?? null,
      })
      return new StepResponse<null, Rollback>(null, {
        id: existing.id,
        created: false,
        prev: {
          is_active: existing.is_active,
          credentials: existing.credentials,
          metadata: existing.metadata,
        },
      })
    }

    const created = await service.createStorePaymentGateways({
      seller_id: input.seller_id,
      gateway: input.gateway,
      is_active: input.is_active ?? false,
      credentials: input.credentials,
      metadata: input.metadata ?? null,
    })
    return new StepResponse<null, Rollback>(null, {
      id: created.id,
      created: true,
    })
  },
  async (rollback, { container }) => {
    if (!rollback) {
      return
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    if (rollback.created) {
      await service.deleteStorePaymentGateways(rollback.id)
    } else {
      await service.updateStorePaymentGateways({
        id: rollback.id,
        is_active: rollback.prev.is_active,
        credentials: rollback.prev.credentials,
        metadata: rollback.prev.metadata,
      })
    }
  }
)

/**
 * Full-replace sync for payment gateways. Add / edit / delete all happen by
 * sending the complete list in one API call.
 */
export const syncStorePaymentGatewaysStep = createStep(
  "sync-store-payment-gateways",
  async (input: SyncPaymentGatewaysInput, { container }) => {
    if (!input) {
      return new StepResponse(null, null)
    }

    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    const existing = await service.listStorePaymentGateways({
      seller_id: input.seller_id,
    })

    if (existing.length) {
      await service.deleteStorePaymentGateways(existing.map((row) => row.id))
    }

    const createdIds: string[] = []
    for (const gateway of input.gateways) {
      const created = await service.createStorePaymentGateways({
        seller_id: input.seller_id,
        gateway: gateway.gateway,
        is_active: gateway.is_active ?? false,
        credentials: gateway.credentials,
        metadata: gateway.metadata ?? null,
      })
      createdIds.push(created.id)
    }

    return new StepResponse(null, {
      createdIds,
      previous: existing.map((row) => ({
        seller_id: row.seller_id,
        gateway: row.gateway,
        is_active: row.is_active,
        credentials: row.credentials,
        metadata: row.metadata,
      })),
    })
  },
  async (rollback, { container }) => {
    if (!rollback) {
      return
    }

    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )

    if (rollback.createdIds.length) {
      await service.deleteStorePaymentGateways(rollback.createdIds)
    }

    for (const row of rollback.previous) {
      await service.createStorePaymentGateways({
        seller_id: row.seller_id,
        gateway: row.gateway,
        is_active: row.is_active,
        credentials: row.credentials,
        metadata: row.metadata,
      })
    }
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

/**
 * Guard: the requested status must be a valid next move from the order's current
 * marketplace status given the store's active status config. Read-only.
 */
export const validateOrderStatusTransitionStep = createStep(
  "validate-order-status-transition",
  async (
    input: {
      seller_id: string
      order_id: string
      status: StoreOrderStatusType
    },
    { container }
  ) => {
    const ctx = await resolveOrderStoreStatusContext(
      container,
      input.seller_id,
      input.order_id
    )
    assertTransitionAllowed(ctx.statuses, ctx.current, input.status)
    return new StepResponse({ current: ctx.current })
  }
)

/** Append one row to the order's marketplace status history. */
export const createStoreOrderStatusEventStep = createStep(
  "create-store-order-status-event",
  async (input: CreateStoreOrderStatusEventDTO, { container }) => {
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    const [created] = await service.createStoreOrderStatusEvents([input])
    return new StepResponse(created, created.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    await service.deleteStoreOrderStatusEvents(id)
  }
)

/**
 * Upsert the order's 1:1 marketplace extension row, keeping `current_status` in
 * sync with the latest history event. This is the denormalized read model for
 * list/filter views ("my orders by status") — one indexed row per order, no
 * history scan. Compensation restores the previous status, or deletes the row
 * if this call created it.
 */
export const upsertOrderExtensionStep = createStep(
  "upsert-order-extension",
  async (
    input: {
      order_id: string
      seller_id: string
      status: StoreOrderStatusType
    },
    { container }
  ) => {
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    const [existing] = await service.listOrderExtensions({
      order_id: input.order_id,
    })

    type OrderExtensionRollback = {
      id: string
      created: boolean
      prev_status: StoreOrderStatusType | null
    }

    if (existing) {
      await service.updateOrderExtensions({
        id: existing.id,
        current_status: input.status,
      })
      return new StepResponse<null, OrderExtensionRollback>(null, {
        id: existing.id,
        created: false,
        prev_status: existing.current_status as StoreOrderStatusType,
      })
    }

    const created = await service.createOrderExtensions({
      order_id: input.order_id,
      seller_id: input.seller_id,
      current_status: input.status,
    })
    return new StepResponse<null, OrderExtensionRollback>(null, {
      id: created.id,
      created: true,
      prev_status: null,
    })
  },
  async (rollback, { container }) => {
    if (!rollback) {
      return
    }
    const service = container.resolve<MarketplaceProfileModuleService>(
      MercurModules.MARKETPLACE_PROFILE
    )
    if (rollback.created) {
      await service.deleteOrderExtensions(rollback.id)
    } else if (rollback.prev_status) {
      await service.updateOrderExtensions({
        id: rollback.id,
        current_status: rollback.prev_status,
      })
    }
  }
)

/**
 * Sync key marketplace transitions into Medusa's native order state:
 *   - `cancelled` → cancel the Medusa order.
 *   - `delivered` → mark every not-yet-delivered fulfillment as delivered.
 * Other statuses are marketplace-only and touch nothing. No compensation: these
 * native transitions are not cleanly reversible and this is the final step.
 */
export const syncMedusaOrderStateStep = createStep(
  "sync-medusa-order-state",
  async (
    input: {
      order_id: string
      seller_id: string
      status: StoreOrderStatusType
    },
    { container }
  ) => {
    if (input.status === StoreOrderStatusType.CANCELLED) {
      await cancelOrderWorkflow(container).run({
        input: { order_id: input.order_id, canceled_by: input.seller_id },
      })
    } else if (input.status === StoreOrderStatusType.DELIVERED) {
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const {
        data: [order],
      } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "fulfillments.id",
          "fulfillments.delivered_at",
          "fulfillments.canceled_at",
        ],
        filters: { id: input.order_id },
      })

      const fulfillments = (order?.fulfillments ?? []) as Array<{
        id: string
        delivered_at: Date | null
        canceled_at: Date | null
      }>

      for (const fulfillment of fulfillments) {
        if (fulfillment.delivered_at || fulfillment.canceled_at) {
          continue
        }
        await markOrderFulfillmentAsDeliveredWorkflow(container).run({
          input: { orderId: input.order_id, fulfillmentId: fulfillment.id },
        })
      }
    }

    return new StepResponse(null)
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
