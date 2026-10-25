import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../modules/marketplace-profile/service"
import { createStoreBranch } from "../../../../../workflows/marketplace-profile/utils/create-store-branch"
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

  // Same branch setup as "create branch from external location".
  const branch = await createStoreBranch(req.scope, {
    seller_id: sellerId,
    name,
    address,
    is_active,
    latitude,
    longitude,
  })
  const locationId = branch.location_id

  const stockLocation = await refetchStockLocation(
    req.scope,
    locationId,
    vendorStoreLocationFields
  )

  res.status(201).json({
    location: {
      ...stockLocation,
      is_active: branch.is_active,
      latitude: branch.latitude,
      longitude: branch.longitude,
    },
  })
}
