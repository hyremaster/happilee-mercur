import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"
import { createSellerStockLocationsWorkflow } from "../../../../../workflows/stock-location"
import { refetchStockLocation } from "../../../stock-locations/helpers"
import { assertStoreOwnership } from "../../helpers"
import { vendorStoreLocationFields } from "../../query-config"
import { VendorCreateStoreLocationType } from "../../validators"

type LocationDetail = {
  stock_location_id: string
  is_active: boolean
  latitude: number | null
  longitude: number | null
}

// GET /vendor/store-onboarding/:id/locations — list the store's fulfillment centres.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  await assertStoreOwnership(req, sellerId)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const { data: links } = await query.graph({
    entity: "stock_location_seller",
    fields: [
      "stock_location_id",
      "stock_location.id",
      "stock_location.name",
      "stock_location.created_at",
      "stock_location.updated_at",
      "stock_location.address.*",
    ],
    filters: { seller_id: sellerId },
  })

  const locationIds = links
    .map((l) => l.stock_location_id)
    .filter((id): id is string => !!id)

  const details: LocationDetail[] = locationIds.length
    ? await service.listStoreLocationDetails({
        stock_location_id: locationIds,
      })
    : []
  const detailByLocation = new Map(details.map((d) => [d.stock_location_id, d]))

  const locations = links.map((l) => {
    const detail = detailByLocation.get(l.stock_location_id)
    return {
      ...l.stock_location,
      is_active: detail?.is_active ?? true,
      latitude: detail?.latitude ?? null,
      longitude: detail?.longitude ?? null,
    }
  })

  res.json({ locations, count: locations.length })
}

// POST /vendor/store-onboarding/:id/locations — add a fulfillment centre.
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreateStoreLocationType>,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  await assertStoreOwnership(req, sellerId)

  const { name, address, is_active, latitude, longitude } = req.validatedBody

  // Reuse Mercur's seller-scoped StockLocation workflow (creates the location +
  // seller link).
  const { result } = await createSellerStockLocationsWorkflow(req.scope).run({
    input: {
      locations: [{ name, address }],
      seller_id: sellerId,
    },
  })
  const locationId = result[0].id

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  const detail = await service.createStoreLocationDetails({
    stock_location_id: locationId,
    is_active: is_active ?? true,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
  })

  const stockLocation = await refetchStockLocation(
    req.scope,
    locationId,
    vendorStoreLocationFields
  )

  res.status(201).json({
    location: {
      ...stockLocation,
      is_active: detail.is_active,
      latitude: detail.latitude,
      longitude: detail.longitude,
    },
  })
}
