import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { IEventBusModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  HttpTypes,
  IntegrationSyncRunStatus,
  IntegrationSyncStream,
  IntegrationSyncTrigger,
} from "@mercurjs/types"

import type { IntegrationSyncRunRow } from "../../../../../modules/integration/service"
import { IntegrationWorkflowEvents } from "../../../../../workflows/events"
import {
  findSyncStream,
  isRunStale,
  syncIntegrationLocationsWorkflow,
} from "../../../../../workflows/integration"
import { assertCapability, listLocationDTOs, resolveIntegrationService } from "../../helpers"
import { VendorRunIntegrationSyncType } from "../../validators"

const ALREADY_RUNNING = (stream: string) =>
  `A ${stream} sync is already running for this store. Try again shortly.`

// POST /vendor/integrations/:provider_id/sync { stream } — run a sync stream
// now. `locations` runs inline (one small read-only call) and returns 200 with
// the refreshed locations. Catalogue streams (items, prices, stock) can take
// minutes, so the run is created here and executed in the background: 202
// with the run in status `running`; poll /sync-runs for the result. A manual
// items sync also runs prices and stock afterwards. Provider/API failures are
// reported on the run, not as HTTP errors.
export const POST = async (
  req: AuthenticatedMedusaRequest<VendorRunIntegrationSyncType>,
  res: MedusaResponse<HttpTypes.VendorIntegrationSyncResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const providerId = req.params.provider_id
  const { stream } = req.validatedBody
  const service = resolveIntegrationService(req.scope)

  const definition = findSyncStream(stream)
  if (!definition) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unknown sync stream "${stream}".`)
  }
  assertCapability(service, providerId, definition.capability, stream)

  if (definition.inline && stream === IntegrationSyncStream.LOCATIONS) {
    const { result } = await syncIntegrationLocationsWorkflow(req.scope).run({
      input: {
        seller_id: sellerId,
        provider_id: providerId,
        trigger: IntegrationSyncTrigger.MANUAL,
      },
    })
    if (result.already_running || !result.run) {
      throw new MedusaError(MedusaError.Types.CONFLICT, ALREADY_RUNNING(stream))
    }
    const locations = await listLocationDTOs(req.scope, sellerId, providerId)
    res.json({ run: result.run, locations })
    return
  }

  // Fail fast (400) instead of queueing a run that can only fail.
  await service.requireConnectionInput(sellerId, providerId)

  const [latest] = (await service.listIntegrationSyncRuns(
    { seller_id: sellerId, provider_id: providerId, stream },
    { order: { started_at: "DESC" }, take: 1 }
  )) as IntegrationSyncRunRow[]
  if (
    latest?.status === IntegrationSyncRunStatus.RUNNING &&
    !isRunStale(definition, latest)
  ) {
    throw new MedusaError(MedusaError.Types.CONFLICT, ALREADY_RUNNING(stream))
  }

  const run = (await service.createIntegrationSyncRuns({
    seller_id: sellerId,
    provider_id: providerId,
    stream,
    trigger: IntegrationSyncTrigger.MANUAL,
    status: IntegrationSyncRunStatus.RUNNING,
    started_at: new Date(),
  })) as IntegrationSyncRunRow

  await req.scope.resolve<IEventBusModuleService>(Modules.EVENT_BUS).emit({
    name: IntegrationWorkflowEvents.SYNC_REQUESTED,
    data: { seller_id: sellerId, provider_id: providerId, stream, run_id: run.id },
  })

  res.status(202).json({ run: service.toSyncRunDTO(run) })
}
