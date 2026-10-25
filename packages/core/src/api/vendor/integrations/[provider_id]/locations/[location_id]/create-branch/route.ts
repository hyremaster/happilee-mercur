import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import type { IntegrationLocationRow } from "../../../../../../../modules/integration/service"
import { updateIntegrationLocationMappingWorkflow } from "../../../../../../../workflows/integration"
import { createStoreBranch } from "../../../../../../../workflows/marketplace-profile/utils/create-store-branch"
import {
  assertLocationsCapability,
  resolveIntegrationService,
  toLocationDTO,
} from "../../../../helpers"

// POST /vendor/integrations/:provider_id/locations/:location_id/create-branch
// Create a branch from the external location's name and address (same setup
// as adding a fulfillment centre in onboarding) and map it. The branch has no
// map pin: the provider doesn't supply coordinates.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorIntegrationLocationResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const providerId = req.params.provider_id
  const service = resolveIntegrationService(req.scope)

  assertLocationsCapability(service, providerId)

  const [location] = (await service.listIntegrationLocations({
    id: req.params.location_id,
    seller_id: sellerId,
    provider_id: providerId,
  })) as IntegrationLocationRow[]
  if (!location) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Location not found.")
  }
  if (location.stock_location_id) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This location is already mapped to a branch."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: ["id", "address.country_code"],
    filters: { id: sellerId },
  })
  const countryCode =
    (seller as { address?: { country_code?: string | null } | null } | undefined)
      ?.address?.country_code ?? "in"

  const branch = await createStoreBranch(req.scope, {
    seller_id: sellerId,
    name: location.name,
    address: {
      address_1: location.address?.trim() || location.name,
      city: location.city ?? null,
      country_code: countryCode,
    },
    is_active: true,
  })

  // If mapping fails the branch stays (unmapped); it can be mapped by hand.
  const { result } = await updateIntegrationLocationMappingWorkflow(req.scope).run({
    input: {
      seller_id: sellerId,
      provider_id: providerId,
      location_id: location.id,
      stock_location_id: branch.location_id,
    },
  })

  res.status(201).json({ location: await toLocationDTO(req.scope, result) })
}
