import { ILockingModule } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  ExternalLocation,
  IntegrationLocationStatus,
  IntegrationSyncRunDTO,
  IntegrationSyncRunStatus,
  IntegrationSyncStream,
  IntegrationSyncTrigger,
  MercurModules,
} from "@mercurjs/types"

import type IntegrationModuleService from "../../../modules/integration/service"
import type { IntegrationLocationRow } from "../../../modules/integration/service"

export type SyncIntegrationLocationsStepInput = {
  seller_id: string
  provider_id: string
  trigger: IntegrationSyncTrigger
}

export type SyncIntegrationLocationsStepOutput = {
  /** null when another locations sync for this store/provider was running. */
  run: IntegrationSyncRunDTO | null
  already_running: boolean
}

/** Safety expiry so a crashed process can't hold the lock forever. */
const LOCK_EXPIRE_SECONDS = 300

export const syncLocationsLockKey = (sellerId: string, providerId: string) =>
  `integration-sync:${sellerId}:${providerId}:${IntegrationSyncStream.LOCATIONS}`

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? null) === (b ?? null)

/**
 * Fetch the provider's locations and converge `integration_location` to them:
 * new → added unmapped, changed → refreshed, missing or reported inactive →
 * `inactive`. Mappings (`stock_location_id`) are never changed here, and our
 * stock locations are never touched.
 *
 * The external call happens outside any DB transaction. The sync is
 * idempotent: a failed or interrupted run changes at most some rows, and the
 * next run converges, so there is no compensation. Failures are recorded on
 * the run (status `failed`) rather than thrown, so callers always get a run.
 */
export const syncIntegrationLocationsStep = createStep(
  "sync-integration-locations",
  async (input: SyncIntegrationLocationsStepInput, { container }) => {
    const service = container.resolve<IntegrationModuleService>(
      MercurModules.INTEGRATION
    )
    const locking = container.resolve<ILockingModule>(Modules.LOCKING)

    const key = syncLocationsLockKey(input.seller_id, input.provider_id)
    const ownerId = `${key}:${Date.now()}:${Math.random().toString(36).slice(2)}`

    try {
      await locking.acquire(key, { ownerId, expire: LOCK_EXPIRE_SECONDS })
    } catch {
      return new StepResponse<SyncIntegrationLocationsStepOutput>({
        run: null,
        already_running: true,
      })
    }

    try {
      const run = await service.createIntegrationSyncRuns({
        seller_id: input.seller_id,
        provider_id: input.provider_id,
        stream: IntegrationSyncStream.LOCATIONS,
        trigger: input.trigger,
        status: IntegrationSyncRunStatus.RUNNING,
        started_at: new Date(),
      })

      let counts: Record<string, number> | null = null
      let error: string | null = null

      try {
        const connection = await service.requireConnectionInput(
          input.seller_id,
          input.provider_id
        )
        const fetched = await service.fetchExternalLocations(
          input.provider_id,
          connection
        )
        counts = await applyLocations(service, input, fetched)
      } catch (e) {
        error = e instanceof Error ? e.message : "Locations sync failed."
      }

      const finished = await service.updateIntegrationSyncRuns({
        id: run.id,
        status: error ? IntegrationSyncRunStatus.FAILED : IntegrationSyncRunStatus.SUCCESS,
        counts,
        error,
        finished_at: new Date(),
      })

      return new StepResponse<SyncIntegrationLocationsStepOutput>({
        run: service.toSyncRunDTO(finished),
        already_running: false,
      })
    } finally {
      await locking.release(key, { ownerId }).catch(() => undefined)
    }
  }
)

async function applyLocations(
  service: IntegrationModuleService,
  input: SyncIntegrationLocationsStepInput,
  fetched: ExternalLocation[]
): Promise<Record<string, number>> {
  const now = new Date()

  // A provider may repeat an id; the last occurrence wins.
  const incoming = new Map<string, ExternalLocation>()
  for (const location of fetched) {
    const externalId = String(location.external_id).trim()
    if (externalId) {
      incoming.set(externalId, { ...location, external_id: externalId })
    }
  }

  const existing = (await service.listIntegrationLocations({
    seller_id: input.seller_id,
    provider_id: input.provider_id,
  })) as IntegrationLocationRow[]
  const byExternalId = new Map(existing.map((row) => [row.external_id, row]))

  let created = 0
  let updated = 0
  let deactivated = 0

  const toCreate: Record<string, unknown>[] = []
  const toUpdate: Record<string, unknown>[] = []

  for (const location of incoming.values()) {
    const status = location.is_active
      ? IntegrationLocationStatus.ACTIVE
      : IntegrationLocationStatus.INACTIVE
    const row = byExternalId.get(location.external_id)

    if (!row) {
      created++
      toCreate.push({
        seller_id: input.seller_id,
        provider_id: input.provider_id,
        external_id: location.external_id,
        name: location.name,
        code: location.code ?? null,
        address: location.address ?? null,
        city: location.city ?? null,
        status,
        stock_location_id: null,
        last_seen_at: now,
        raw: location.raw ?? null,
      })
      continue
    }

    const changed =
      !sameText(row.name, location.name) ||
      !sameText(row.code, location.code) ||
      !sameText(row.address, location.address) ||
      !sameText(row.city, location.city) ||
      row.status !== status
    if (changed) {
      updated++
    }
    toUpdate.push({
      id: row.id,
      name: location.name,
      code: location.code ?? null,
      address: location.address ?? null,
      city: location.city ?? null,
      status,
      last_seen_at: now,
      raw: location.raw ?? null,
    })
  }

  for (const row of existing) {
    if (!incoming.has(row.external_id) && row.status !== IntegrationLocationStatus.INACTIVE) {
      deactivated++
      toUpdate.push({ id: row.id, status: IntegrationLocationStatus.INACTIVE })
    }
  }

  if (toCreate.length) {
    await service.createIntegrationLocations(toCreate)
  }
  if (toUpdate.length) {
    await service.updateIntegrationLocations(toUpdate)
  }

  const mapped = existing.filter((row) => !!row.stock_location_id).length

  return {
    found: incoming.size,
    created,
    updated,
    deactivated,
    mapped,
  }
}
