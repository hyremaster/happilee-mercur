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
import { projectItemsPage } from "../utils/project-products"
import { syncLockKey } from "../utils/sync-lock"

export type ProjectIntegrationProductsStepInput = {
  seller_id: string
  provider_id: string
  trigger: IntegrationSyncTrigger
  /** A run already created by the API (manual trigger); otherwise one is created. */
  run_id?: string
  /** Stop after about this many items, to try a first run on a few products. */
  max_items?: number
}

export type ProjectIntegrationProductsStepOutput = {
  run: IntegrationSyncRunDTO | null
  already_running: boolean
}

/** Lock expiry; renewed after every page so long runs keep it. */
const LOCK_EXPIRE_SECONDS = 30 * 60
const PAGE_SIZE = 25

/**
 * Turn staged items that changed into Medusa products, page by page. Uses
 * staged data only and never calls the provider. Item failures are counted and
 * stay pending; failures are recorded on the run, not thrown.
 */
export const projectIntegrationProductsStep = createStep(
  "project-integration-products",
  async (input: ProjectIntegrationProductsStepInput, { container }) => {
    const service = container.resolve<IntegrationModuleService>(MercurModules.INTEGRATION)
    const locking = container.resolve<ILockingModule>(Modules.LOCKING)
    const scope = { seller_id: input.seller_id, provider_id: input.provider_id }

    const key = syncLockKey(input.seller_id, input.provider_id, IntegrationSyncStream.PRODUCTS)
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
      return new StepResponse<ProjectIntegrationProductsStepOutput>({
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
              stream: IntegrationSyncStream.PRODUCTS,
              trigger: input.trigger,
              status: IntegrationSyncRunStatus.RUNNING,
              started_at: new Date(),
            })
      ) as IntegrationSyncRunRow

      const counts: Record<string, number> = {
        created: 0,
        updated: 0,
        unpublished: 0,
        skipped: 0,
        failed: 0,
      }
      let error: string | null = null

      try {
        // Fails a disabled or removed connection, like the other streams.
        await service.requireConnectionInput(input.seller_id, input.provider_id)
        counts.blocked_cleared = await service.clearBlockedItemsWithoutProduct(scope)

        let after = ""
        let remaining = input.max_items ?? Number.POSITIVE_INFINITY
        while (remaining > 0) {
          const items = await service.listProjectionPage(scope, after, Math.min(PAGE_SIZE, remaining))
          if (!items.length) {
            break
          }
          remaining -= items.length
          const page = await projectItemsPage(container, service, scope, items)
          for (const [name, value] of Object.entries(page)) {
            counts[name] += value
          }
          after = items[items.length - 1].external_id
          await locking
            .acquire(key, { ownerId, expire: LOCK_EXPIRE_SECONDS })
            .catch(() => undefined)
        }

        if (counts.failed && !counts.created && !counts.updated && !counts.unpublished) {
          error = "No products could be updated. Please try again later or contact support."
        }
      } catch (e) {
        error = toSyncRunError(e)
        container
          .resolve(ContainerRegistrationKeys.LOGGER)
          .error(
            `Product projection failed for store ${input.seller_id} / ${input.provider_id}: ${toSyncRunLogMessage(e)}`
          )
      }

      const finished = await service.updateIntegrationSyncRuns({
        id: run.id,
        status: error ? IntegrationSyncRunStatus.FAILED : IntegrationSyncRunStatus.SUCCESS,
        counts,
        error,
        finished_at: new Date(),
      })

      return new StepResponse<ProjectIntegrationProductsStepOutput>({
        run: service.toSyncRunDTO(finished as IntegrationSyncRunRow),
        already_running: false,
      })
    } finally {
      await locking.release(key, { ownerId }).catch(() => undefined)
    }
  }
)
