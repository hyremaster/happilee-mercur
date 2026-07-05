import { MedusaContainer } from "@medusajs/framework"
import {
  DEFAULT_STORE_ORDER_STATUSES,
  MercurModules,
  StoreOrderStatusType,
  StoreOrderStatusDTO,
  StoreOrderStatusEventDTO,
} from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"
import { getAllowedNextStatuses } from "./order-status-transitions"

/**
 * Fallback status config (as StoreOrderStatusDTO-shaped rows) for stores that
 * were not created through the onboarding wizard and therefore have no
 * store_order_status rows seeded. Uses the canonical default active statuses so
 * the status-update feature works for every seller.
 */
const defaultStatusConfig = (): StoreOrderStatusDTO[] =>
  DEFAULT_STORE_ORDER_STATUSES.filter((s) => s.is_active).map((s) => ({
    id: `default_${s.status}`,
    store_profile_id: "",
    status: s.status,
    display_name: s.display_name,
    color: s.color,
    is_active: s.is_active,
    is_required: s.is_required,
    rank: s.rank,
    metadata: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  }))

export type OrderStoreStatusContext = {
  store_profile_id: string | null
  /** Active status config for the store, rank-ordered. */
  statuses: StoreOrderStatusDTO[]
  /** Current status = latest event, or order_placed when no events yet. */
  current: StoreOrderStatusType
  allowed_next: StoreOrderStatusType[]
  /** Full change history, newest first. */
  history: StoreOrderStatusEventDTO[]
}

/**
 * Reads everything needed to render / validate an order's marketplace status:
 * the store's active status config (from store_profile), the current status
 * (latest history event, defaulting to order_placed), the allowed next moves,
 * and the full history. Pure read — no mutation.
 */
export async function resolveOrderStoreStatusContext(
  container: MedusaContainer,
  sellerId: string,
  orderId: string
): Promise<OrderStoreStatusContext> {
  const service = container.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const [profile] = await service.listStoreProfiles({ seller_id: sellerId })

  const configured = profile
    ? (
        await service.listStoreOrderStatuses({
          store_profile_id: profile.id,
          is_active: true,
        })
      ).sort((a, b) => a.rank - b.rank)
    : []

  // Sellers created outside the onboarding wizard have no configured statuses;
  // fall back to the canonical defaults so the feature works everywhere.
  const statuses = configured.length ? configured : defaultStatusConfig()

  const history: StoreOrderStatusEventDTO[] =
    await service.listStoreOrderStatusEvents(
      { order_id: orderId, seller_id: sellerId },
      { order: { created_at: "DESC" } }
    )

  // Prefer the denormalized 1:1 extension row (source of truth for lists), fall
  // back to the latest history event, then to order_placed for orders that have
  // never transitioned.
  const [extension] = await service.listOrderExtensions({ order_id: orderId })

  const current =
    (extension?.current_status as StoreOrderStatusType) ??
    (history[0]?.status as StoreOrderStatusType) ??
    StoreOrderStatusType.ORDER_PLACED

  const allowed_next = getAllowedNextStatuses(statuses, current)

  return {
    store_profile_id: profile?.id ?? null,
    statuses,
    current,
    allowed_next,
    history,
  }
}
