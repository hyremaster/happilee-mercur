import { Module } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import loadProviders from "./loaders/providers"
import IntegrationModuleService from "./service"

/**
 * Store integrations module. Providers are registered in medusa-config:
 *
 *   {
 *     resolve: "@mercurjs/core/modules/integration",
 *     options: {
 *       providers: [{ resolve: "@mercurjs/integration-gofrugal", id: "gofrugal" }],
 *     },
 *   }
 *
 * Without providers the module loads and lists nothing.
 */
export const INTEGRATION_MODULE = MercurModules.INTEGRATION
export { IntegrationModuleService }
export type { StoreIntegrationRow, PreparedStoreIntegration } from "./service"

export default Module(INTEGRATION_MODULE, {
  service: IntegrationModuleService,
  loaders: [loadProviders],
})
