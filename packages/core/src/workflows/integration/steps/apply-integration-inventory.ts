import { ILockingModule } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  IntegrationSyncRunDTO,
  IntegrationSyncRunStatus,
  IntegrationSyncStream,
  IntegrationSyncTrigger,
  MercurModules,
} from "@mercurjs/types"

import type IntegrationModuleService from "../../../modules/integration/service"
import type { IntegrationSyncRunRow } from "../../../modules/integration/service"
import {
  toSyncRunError,
  toSyncRunLogMessage,
} from "../../../modules/integration/utils/integration-error"
import { projectInventoryPage, toDefaultBuffer } from "../utils/project-inventory"
import { syncLockKey } from "../utils/sync-lock"

export type ApplyIntegrationInventoryStepInput = {
  seller_id: string
  provider_id: string
  trigger: IntegrationSyncTrigger
  /** A run already created by the API (manual trigger); otherwise one is created. */
  run_id?: string
}

export type ApplyIntegrationInventoryStepOutput = {
  run: IntegrationSyncRunDTO | null
  already_running: boolean
}

/** Lock expiry; renewed after every page so long runs keep it. */
const LOCK_EXPIRE_SECONDS = 30 * 60
const PAGE_SIZE = 100

/**
 * Write staged stock to Medusa inventory levels, page by page. Uses staged data
 * only and never calls the provider. Staged stock is only zeroed after a
 * complete snapshot, so a failed pull can't empty a branch here.
 */
export const applyIntegrationInventoryStep = createStep(
  "apply-integration-inventory",
  async (input: ApplyIntegrationInventoryStepInput, { container }) => {
    const service = container.resolve<IntegrationModuleService>(MercurModules.INTEGRATION)
    const locking = container.resolve<ILockingModule>(Modules.LOCKING)
    const scope = { seller_id: input.seller_id, provider_id: input.provider_id }

    const key = syncLockKey(input.seller_id, input.provider_id, IntegrationSyncStream.INVENTORY)
    const ownerId = `${key}:${Date.now()}:${Math.random().toString(36).slice(2)}`

    try {
      await locking.acquire(key, { ownerId, expire: LOCK_EXPIRE_SECONDS })
    } catch {
      if (input.run_id) {
        await service.updateIntegrationSyncRuns({
          id: input.run_id,
          status: IntegrationSyncRunStatus.FAILED,
          error: "Another sync of this stream was already running.",
          finished_at: new Date(),
        })
      }
      return new StepResponse<ApplyIntegrationInventoryStepOutput>({
        run: null,
        already_running: true,
      })
    }

    try {
      const run = (
        input.run_id
          ? await service.retrieveIntegrationSyncRun(input.run_id)
          : await service.createIntegrationSyncRuns({
              ...scope,
              stream: IntegrationSyncStream.INVENTORY,
              trigger: input.trigger,
              status: IntegrationSyncRunStatus.RUNNING,
              started_at: new Date(),
            })
      ) as IntegrationSyncRunRow

      const counts: Record<string, number> = { created: 0, updated: 0, failed: 0 }
      let error: string | null = null

      try {
        // Fails a disabled or removed connection, like the other streams.
        const connection = await service.requireConnectionInput(input.seller_id, input.provider_id)
        const defaultBuffer = toDefaultBuffer(connection.settings.default_buffer)

        let after = ""
        for (;;) {
          const changes = await service.listStockChangesPage(scope, defaultBuffer, after, PAGE_SIZE)
          if (!changes.length) {
            break
          }
          const page = await projectInventoryPage(container, service, scope, changes)
          for (const [name, value] of Object.entries(page)) {
            counts[name] += value
          }
          after = changes[changes.length - 1].id
          await locking
            .acquire(key, { ownerId, expire: LOCK_EXPIRE_SECONDS })
            .catch(() => undefined)
        }

        if (counts.failed && !counts.created && !counts.updated) {
          error = "No stock could be updated. Please try again later or contact support."
        }
      } catch (e) {
        error = toSyncRunError(e)
        container
          .resolve(ContainerRegistrationKeys.LOGGER)
          .error(
            `Inventory sync failed for store ${input.seller_id} / ${input.provider_id}: ${toSyncRunLogMessage(e)}`
          )
      }

      const finished = await service.updateIntegrationSyncRuns({
        id: run.id,
        status: error ? IntegrationSyncRunStatus.FAILED : IntegrationSyncRunStatus.SUCCESS,
        counts,
        error,
        finished_at: new Date(),
      })

      return new StepResponse<ApplyIntegrationInventoryStepOutput>({
        run: service.toSyncRunDTO(finished as IntegrationSyncRunRow),
        already_running: false,
      })
    } finally {
      await locking.release(key, { ownerId }).catch(() => undefined)
    }
  }
)
