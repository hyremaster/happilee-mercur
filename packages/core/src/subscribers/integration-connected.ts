import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  IntegrationCapability,
  IntegrationSyncTrigger,
  MercurModules,
} from "@mercurjs/types"

import type IntegrationModuleService from "../modules/integration/service"
import { IntegrationWorkflowEvents } from "../workflows/events"
import { syncIntegrationLocationsWorkflow } from "../workflows/integration"

type IntegrationConnectedPayload = { seller_id: string; provider_id: string }

/**
 * After a store connects (or re-keys) a provider that supports locations,
 * pull its locations so the mapping screen is ready without a manual sync.
 * Runs off the request, so saving credentials is never slowed down by it.
 */
export default async function integrationConnectedHandler({
  event,
  container,
}: SubscriberArgs<IntegrationConnectedPayload>) {
  const { seller_id, provider_id } = event.data
  const service = container.resolve<IntegrationModuleService>(MercurModules.INTEGRATION)

  if (!service.supportsCapability(provider_id, IntegrationCapability.LOCATIONS)) {
    return
  }

  try {
    await syncIntegrationLocationsWorkflow(container).run({
      input: { seller_id, provider_id, trigger: IntegrationSyncTrigger.CONNECT },
    })
  } catch (e) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(
        `Locations sync after connecting ${provider_id} failed for store ${seller_id}: ${
          e instanceof Error ? e.message : String(e)
        }`
      )
  }
}

export const config: SubscriberConfig = {
  event: IntegrationWorkflowEvents.CONNECTED,
  context: { subscriberId: "integration-connected-sync-locations" },
}
