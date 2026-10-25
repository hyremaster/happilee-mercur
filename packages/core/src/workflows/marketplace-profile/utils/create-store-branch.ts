import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"
import { createSellerStockLocationsWorkflow } from "../../stock-location"
import { syncStoreFulfillmentOptionsWorkflow } from "../workflows/sync-store-fulfillment-options"

export type StoreBranchAddress = {
  address_1: string
  address_2?: string | null
  company?: string | null
  city?: string | null
  country_code: string
  province?: string | null
  postal_code?: string | null
  phone?: string | null
}

export type CreateStoreBranchInput = {
  seller_id: string
  name: string
  address?: StoreBranchAddress | null
  is_active?: boolean
  latitude?: number | null
  longitude?: number | null
}

export type CreatedStoreBranch = {
  location_id: string
  is_active: boolean
  latitude: number | null
  longitude: number | null
}

/**
 * Create a store branch (fulfillment centre) the way store onboarding does:
 * a seller-scoped StockLocation, its StoreLocationDetail (active flag + map
 * pin), and the same shipping setup the store's other locations have, without
 * which checkout never offers the new branch.
 *
 * Shared by the onboarding locations route and "create branch from external
 * location" so both produce identical branches.
 */
export async function createStoreBranch(
  container: MedusaContainer,
  input: CreateStoreBranchInput
): Promise<CreatedStoreBranch> {
  const { result } = await createSellerStockLocationsWorkflow(container).run({
    input: {
      locations: [{ name: input.name, address: input.address ?? undefined }],
      seller_id: input.seller_id,
    },
  })
  const locationId = result[0].id

  const service = container.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  const detail = await service.createStoreLocationDetails({
    stock_location_id: locationId,
    is_active: input.is_active ?? true,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
  })

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [profile] = await service.listStoreProfiles({ seller_id: input.seller_id })
  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: ["id", "currency_code", "address.country_code"],
    filters: { id: input.seller_id },
  })
  const sellerRow = seller as
    | {
        currency_code?: string | null
        address?: { country_code?: string | null } | null
      }
    | undefined

  await syncStoreFulfillmentOptionsWorkflow(container).run({
    input: {
      seller_id: input.seller_id,
      currency_code: sellerRow?.currency_code ?? "inr",
      country_code:
        input.address?.country_code ?? sellerRow?.address?.country_code ?? null,
      fulfillment_methods:
        (profile?.fulfillment_methods as string[] | null | undefined) ?? null,
      location_ids: [locationId],
    },
  })

  return {
    location_id: locationId,
    is_active: detail.is_active,
    latitude: detail.latitude ?? null,
    longitude: detail.longitude ?? null,
  }
}
