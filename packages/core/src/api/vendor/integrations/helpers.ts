import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  IntegrationCapability,
  IntegrationLocationDTO,
  IntegrationSyncRunDTO,
  IntegrationSyncStream,
  MercurModules,
} from "@mercurjs/types"

import type IntegrationModuleService from "../../../modules/integration/service"
import type {
  IntegrationLocationRow,
  IntegrationSyncRunRow,
} from "../../../modules/integration/service"

export const resolveIntegrationService = (scope: MedusaContainer) =>
  scope.resolve<IntegrationModuleService>(MercurModules.INTEGRATION)

/** 404 for unknown providers, 400 for providers without location support. */
export function assertLocationsCapability(
  service: IntegrationModuleService,
  providerId: string
) {
  service.retrieveIntegrationProvider(providerId)
  if (!service.supportsCapability(providerId, IntegrationCapability.LOCATIONS)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Integration provider "${providerId}" doesn't support locations.`
    )
  }
}

/** 404 for unknown providers, 400 when the provider lacks the stream's capability. */
export function assertCapability(
  service: IntegrationModuleService,
  providerId: string,
  capability: IntegrationCapability,
  label: string
) {
  service.retrieveIntegrationProvider(providerId)
  if (!service.supportsCapability(providerId, capability)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Integration provider "${providerId}" doesn't support ${label}.`
    )
  }
}

/** The store's external locations for a provider, with mapped branch names. */
export async function listLocationDTOs(
  scope: MedusaContainer,
  sellerId: string,
  providerId: string
): Promise<IntegrationLocationDTO[]> {
  const service = resolveIntegrationService(scope)
  const rows = (await service.listIntegrationLocations(
    { seller_id: sellerId, provider_id: providerId },
    { order: { name: "ASC" } }
  )) as IntegrationLocationRow[]

  const branches = await loadBranchNames(
    scope,
    rows.map((row) => row.stock_location_id).filter((id): id is string => !!id)
  )
  return rows.map((row) => service.toIntegrationLocationDTO(row, branches))
}

export async function toLocationDTO(
  scope: MedusaContainer,
  row: IntegrationLocationRow
): Promise<IntegrationLocationDTO> {
  const branches = await loadBranchNames(
    scope,
    row.stock_location_id ? [row.stock_location_id] : []
  )
  return resolveIntegrationService(scope).toIntegrationLocationDTO(row, branches)
}

export async function latestSyncRun(
  scope: MedusaContainer,
  sellerId: string,
  providerId: string,
  stream: IntegrationSyncStream
): Promise<IntegrationSyncRunDTO | null> {
  const service = resolveIntegrationService(scope)
  const [run] = (await service.listIntegrationSyncRuns(
    { seller_id: sellerId, provider_id: providerId, stream },
    { order: { started_at: "DESC" }, take: 1 }
  )) as IntegrationSyncRunRow[]
  return run ? service.toSyncRunDTO(run) : null
}

async function loadBranchNames(
  scope: MedusaContainer,
  ids: string[]
): Promise<Map<string, { id: string; name: string }>> {
  if (!ids.length) {
    return new Map()
  }
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
    filters: { id: ids },
  })
  return new Map(
    (data as { id: string; name: string }[]).map((location) => [
      location.id,
      { id: location.id, name: location.name },
    ])
  )
}
