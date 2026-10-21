import { ModuleProvider } from "@medusajs/framework/utils"

import { GoFrugalIntegrationProvider } from "./services/gofrugal-provider"

export { GoFrugalIntegrationProvider }
export type { GoFrugalProviderOptions } from "./services/gofrugal-provider"

// Registered under the store integrations module (`@mercurjs/core/modules/integration`).
export default ModuleProvider("integration", {
  services: [GoFrugalIntegrationProvider],
})
