import { useQuery } from "@tanstack/react-query"

import { getStore } from "../services/storeServices"
import { useMe } from "./api/members"

// Industries whose items are made to order (dishes, baked goods): they rarely
// count stock, so variants default to not inventory-managed and are sold out via
// the per-variant "Available" switch instead.
const UNMANAGED_BY_DEFAULT_INDUSTRIES = new Set(["restaurant", "bakery"])

export const defaultManageInventoryForIndustry = (
  industry: string | null | undefined
): boolean => !UNMANAGED_BY_DEFAULT_INDUSTRIES.has(industry ?? "")

/**
 * Default for a new product's "Manage inventory" switch, derived from the
 * active store's industry. Returns `undefined` until the store has loaded so
 * callers don't apply a default before it is known.
 */
export const useDefaultManageInventory = (): boolean | undefined => {
  const { seller_member } = useMe()
  const sellerId = (seller_member as { seller?: { id?: string } } | undefined)
    ?.seller?.id

  const { data, isSuccess, isError } = useQuery({
    queryKey: ["store-onboarding", "store", sellerId],
    queryFn: () => getStore(sellerId as string),
    enabled: !!sellerId,
  })

  if (isError) {
    return true
  }

  if (!isSuccess) {
    return undefined
  }

  return defaultManageInventoryForIndustry(data.store.store_profile?.industry)
}
