import { ModuleProvider } from "@medusajs/framework/utils"

import { GoFrugalIntegrationProvider } from "./services/gofrugal-provider"

export { GoFrugalIntegrationProvider }
export type { GoFrugalProviderOptions } from "./services/gofrugal-provider"
export { GoFrugalApiError, GoFrugalClient } from "./client/gofrugal-client"
export type { GoFrugalResponse, GoFrugalClientOptions } from "./client/gofrugal-client"

// Registered under the store integrations module (`@mercurjs/core/modules/integration`).
export default ModuleProvider("integration", {
  services: [GoFrugalIntegrationProvider],
})
