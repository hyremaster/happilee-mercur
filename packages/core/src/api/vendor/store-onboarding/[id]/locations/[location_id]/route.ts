import {
  deleteStockLocationsWorkflow,
  updateStockLocationsWorkflow,
} from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../../../../modules/marketplace-profile/service"
import {
  refetchStockLocation,
  validateSellerStockLocation,
} from "../../../../stock-locations/helpers"
import { assertStoreOwnership } from "../../../helpers"
import { vendorStoreLocationFields } from "../../../query-config"
import { VendorUpdateStoreLocationType } from "../../../validators"

// POST /vendor/store-onboarding/:id/locations/:location_id — update a centre.
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdateStoreLocationType>,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  const locationId = req.params.location_id
  await assertStoreOwnership(req, sellerId)
  await validateSellerStockLocation(req.scope, sellerId, locationId)

  const { name, address, is_active, latitude, longitude } = req.validatedBody

  const locationUpdate: { name?: string; address?: typeof address } = {}
  if (name !== undefined) {
    locationUpdate.name = name
  }
  if (address !== undefined) {
    locationUpdate.address = address
  }
  if (Object.keys(locationUpdate).length) {
    await updateStockLocationsWorkflow(req.scope).run({
      input: { selector: { id: locationId }, update: locationUpdate },
    })
  }

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  const [detail] = await service.listStoreLocationDetails({
    stock_location_id: locationId,
  })

  if (detail) {
    await service.updateStoreLocationDetails({
      id: detail.id,
      ...(is_active !== undefined ? { is_active } : {}),
      ...(latitude !== undefined ? { latitude } : {}),
      ...(longitude !== undefined ? { longitude } : {}),
    })
  } else {
    await service.createStoreLocationDetails({
      stock_location_id: locationId,
      is_active: is_active ?? true,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    })
  }

  const stockLocation = await refetchStockLocation(
    req.scope,
    locationId,
    vendorStoreLocationFields
  )
  const [fresh] = await service.listStoreLocationDetails({
    stock_location_id: locationId,
  })

  res.json({
    location: {
      ...stockLocation,
      is_active: fresh?.is_active ?? true,
      latitude: fresh?.latitude ?? null,
      longitude: fresh?.longitude ?? null,
    },
  })
}

// DELETE /vendor/store-onboarding/:id/locations/:location_id — remove a centre.
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = req.params.id
  const locationId = req.params.location_id
  await assertStoreOwnership(req, sellerId)
  await validateSellerStockLocation(req.scope, sellerId, locationId)

  await deleteStockLocationsWorkflow(req.scope).run({
    input: { ids: [locationId] },
  })

  const service = req.scope.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )
  const [detail] = await service.listStoreLocationDetails({
    stock_location_id: locationId,
  })
  if (detail) {
    await service.deleteStoreLocationDetails(detail.id)
  }

  res.json({ id: locationId, object: "store_location", deleted: true })
}
