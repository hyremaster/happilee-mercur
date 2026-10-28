import { ILockingModule } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  IntegrationConnectionInput,
  IntegrationPage,
  IntegrationSyncRunDTO,
  IntegrationSyncRunStatus,
  IntegrationSyncStream,
  IntegrationSyncTrigger,
  MercurModules,
} from "@mercurjs/types"

import type IntegrationModuleService from "../../../modules/integration/service"
import type { IntegrationSyncRunRow } from "../../../modules/integration/service"
import { syncLockKey } from "../utils/sync-lock"

export type CatalogSyncStream =
  | IntegrationSyncStream.ITEMS
  | IntegrationSyncStream.PRICES
  | IntegrationSyncStream.STOCK

export const CATALOG_SYNC_STREAMS: CatalogSyncStream[] = [
  IntegrationSyncStream.ITEMS,
  IntegrationSyncStream.PRICES,
  IntegrationSyncStream.STOCK,
]

export const isCatalogSyncStream = (stream: string): stream is CatalogSyncStream =>
  (CATALOG_SYNC_STREAMS as string[]).includes(stream)

export type SyncIntegrationCatalogStreamStepInput = {
  seller_id: string
  provider_id: string
  stream: CatalogSyncStream
  trigger: IntegrationSyncTrigger
  /** A run already created by the API (manual trigger); otherwise one is created. */
  run_id?: string
}

export type SyncIntegrationCatalogStreamStepOutput = {
  run: IntegrationSyncRunDTO | null
  already_running: boolean
}

/** Lock expiry; renewed after every page so long pulls keep it. */
export const CATALOG_LOCK_EXPIRE_SECONDS = 30 * 60
/** Hard stop against a provider that never reports a last page. */
const MAX_PAGES = 5000
const DAY_MS = 24 * 60 * 60 * 1000

type Counts = Record<string, number>

type StreamHandler = {
  /** Delta streams re-pull everything this often (deletions, missed rows). */
  full_every_ms: number | null
  fetch: (
    service: IntegrationModuleService,
    providerId: string,
    connection: IntegrationConnectionInput,
    request: { cursor: string | null; page: number }
  ) => Promise<IntegrationPage<unknown>>
  stage: (
    service: IntegrationModuleService,
    scope: { seller_id: string; provider_id: string },
    rows: unknown[],
    now: Date
  ) => Promise<Counts>
  /** After every page of a full pull succeeded. */
  finishFull: (
    service: IntegrationModuleService,
    scope: { seller_id: string; provider_id: string },
    startedAt: Date
  ) => Promise<Counts>
}

const HANDLERS: Record<CatalogSyncStream, StreamHandler> = {
  [IntegrationSyncStream.ITEMS]: {
    full_every_ms: 7 * DAY_MS,
    fetch: (service, providerId, connection, request) =>
      service.fetchExternalItemsPage(providerId, connection, request),
    stage: (service, scope, rows, now) =>
      service.stageExternalItemsPage(scope, rows as Parameters<IntegrationModuleService["stageExternalItemsPage"]>[1], now),
    finishFull: async (service, scope, startedAt) => ({
      deactivated: await service.deactivateUnseenExternalItems(scope, startedAt),
    }),
  },
  [IntegrationSyncStream.PRICES]: {
    full_every_ms: 7 * DAY_MS,
    fetch: (service, providerId, connection, request) =>
      service.fetchExternalPricesPage(providerId, connection, request),
    stage: (service, scope, rows, now) =>
      service.stageExternalPricesPage(scope, rows as Parameters<IntegrationModuleService["stageExternalPricesPage"]>[1], now),
    finishFull: async () => ({}),
  },
  [IntegrationSyncStream.STOCK]: {
    // Always a full snapshot.
    full_every_ms: 0,
    fetch: (service, providerId, connection, request) =>
      service.fetchExternalStockPage(providerId, connection, { ...request, cursor: null }),
    stage: (service, scope, rows, now) =>
      service.stageExternalStockPage(scope, rows as Parameters<IntegrationModuleService["stageExternalStockPage"]>[1], now),
    finishFull: async (service, scope, startedAt) => ({
      zeroed: await service.zeroUnseenExternalStock(scope, startedAt),
    }),
  },
}

/** Numeric cursors (GoFrugal timestamps) compare as numbers, others as text. */
export function maxCursor(a: string | null, b: string | null | undefined): string | null {
  if (b === null || b === undefined || b === "") {
    return a
  }
  if (a === null) {
    return b
  }
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    return BigInt(b) > BigInt(a) ? b : a
  }
  return b > a ? b : a
}

const addCounts = (total: Counts, page: Counts) => {
  for (const [key, value] of Object.entries(page)) {
    total[key] = (total[key] ?? 0) + value
  }
}

/**
 * Pull one catalogue stream (items, prices or stock) page by page into the
 * staging tables. Each page is fetched outside any transaction and written in
 * one transaction; nothing is projected into Medusa products here.
 *
 * - Delta streams start from the stored cursor, or pull everything when there
 *   is none or the last full pull is older than `full_every_ms`.
 * - The cursor advances only when every page succeeded. A failed run is
 *   retried from the old cursor; idempotent upserts make re-reads harmless.
 * - After a complete full pull, unseen items are deactivated and unseen stock
 *   lots are set to 0.
 * - Failures are recorded on the run (status `failed`), not thrown.
 */
export const syncIntegrationCatalogStreamStep = createStep(
  "sync-integration-catalog-stream",
  async (input: SyncIntegrationCatalogStreamStepInput, { container }) => {
    const service = container.resolve<IntegrationModuleService>(MercurModules.INTEGRATION)
    const locking = container.resolve<ILockingModule>(Modules.LOCKING)
    const handler = HANDLERS[input.stream]
    const scope = { seller_id: input.seller_id, provider_id: input.provider_id }

    const key = syncLockKey(input.seller_id, input.provider_id, input.stream)
    const ownerId = `${key}:${Date.now()}:${Math.random().toString(36).slice(2)}`

    try {
      await locking.acquire(key, { ownerId, expire: CATALOG_LOCK_EXPIRE_SECONDS })
    } catch {
      if (input.run_id) {
        await service.updateIntegrationSyncRuns({
          id: input.run_id,
          status: IntegrationSyncRunStatus.FAILED,
          error: "Another sync of this stream was already running.",
          finished_at: new Date(),
        })
      }
      return new StepResponse<SyncIntegrationCatalogStreamStepOutput>({
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
              stream: input.stream,
              trigger: input.trigger,
              status: IntegrationSyncRunStatus.RUNNING,
              started_at: new Date(),
            })
      ) as IntegrationSyncRunRow
      const startedAt = new Date(run.started_at)

      const counts: Counts = { pages: 0 }
      let error: string | null = null

      try {
        const connection = await service.requireConnectionInput(
          input.seller_id,
          input.provider_id
        )
        const stored = await service.retrieveSyncCursor(scope, input.stream)
        const fullDue =
          handler.full_every_ms === 0 ||
          !stored?.cursor ||
          !stored.last_full_at ||
          (handler.full_every_ms !== null &&
            startedAt.getTime() - new Date(stored.last_full_at).getTime() >=
              handler.full_every_ms)
        const cursor = fullDue ? null : stored?.cursor ?? null
        counts.full = fullDue ? 1 : 0

        let seen: string | null = stored?.cursor ?? null
        let page: number | null = 1
        while (page !== null) {
          if (counts.pages >= MAX_PAGES) {
            throw new Error(`Stopped after ${MAX_PAGES} pages; the provider kept reporting more.`)
          }
          const result = await handler.fetch(service, input.provider_id, connection, {
            cursor,
            page,
          })
          addCounts(counts, await handler.stage(service, scope, result.rows, new Date()))
          seen = maxCursor(seen, result.max_cursor)
          counts.pages++
          page = result.next_page
          // Keep the lock for long pulls.
          await locking
            .acquire(key, { ownerId, expire: CATALOG_LOCK_EXPIRE_SECONDS })
            .catch(() => undefined)
        }

        if (fullDue) {
          addCounts(counts, await handler.finishFull(service, scope, startedAt))
        }
        await service.saveSyncCursor(scope, input.stream, {
          cursor: seen,
          full: fullDue,
          at: startedAt,
        })
      } catch (e) {
        error = e instanceof Error ? e.message : "Catalogue sync failed."
      }

      const finished = await service.updateIntegrationSyncRuns({
        id: run.id,
        status: error ? IntegrationSyncRunStatus.FAILED : IntegrationSyncRunStatus.SUCCESS,
        counts,
        error,
        finished_at: new Date(),
      })

      return new StepResponse<SyncIntegrationCatalogStreamStepOutput>({
        run: service.toSyncRunDTO(finished as IntegrationSyncRunRow),
        already_running: false,
      })
    } finally {
      await locking.release(key, { ownerId }).catch(() => undefined)
    }
  }
)
