import { MedusaError } from "@medusajs/framework/utils"
import {
  IIntegrationProvider,
  IntegrationCapability,
  IntegrationProviderDTO,
} from "@mercurjs/types"

export const IntegrationProviderRegistrationPrefix = "integration_provider_"

type InjectedDependencies = Record<string, unknown>

/**
 * Registry over the providers registered by `loaders/providers.ts`.
 * Auto-registered in the module container as `integrationProviderService`.
 */
export default class IntegrationProviderService {
  protected readonly providers_: Map<string, IIntegrationProvider>

  constructor(container: InjectedDependencies) {
    this.providers_ = new Map()

    for (const key of Object.keys(container)) {
      if (!key.startsWith(IntegrationProviderRegistrationPrefix)) {
        continue
      }
      const id = key.slice(IntegrationProviderRegistrationPrefix.length)
      this.providers_.set(id, container[key] as IIntegrationProvider)
    }
  }

  list(): IntegrationProviderDTO[] {
    return Array.from(this.providers_.keys())
      .map((id) => this.describe(id))
      .sort((a, b) => a.title.localeCompare(b.title))
  }

  /** Capabilities are derived from the optional methods a provider implements. */
  capabilities(provider: IIntegrationProvider): IntegrationCapability[] {
    const capabilities: IntegrationCapability[] = []
    if (typeof provider.listLocations === "function") {
      capabilities.push(IntegrationCapability.LOCATIONS)
    }
    return capabilities
  }

  supports(id: string, capability: IntegrationCapability): boolean {
    const provider = this.providers_.get(id)
    return !!provider && this.capabilities(provider).includes(capability)
  }

  has(id: string): boolean {
    return this.providers_.has(id)
  }

  retrieve(id: string): IIntegrationProvider {
    const provider = this.providers_.get(id)
    if (!provider) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Integration provider "${id}" is not available.`
      )
    }
    return provider
  }

  describe(id: string): IntegrationProviderDTO {
    const provider = this.retrieve(id)
    return {
      id,
      ...provider.getDefinition(),
      capabilities: this.capabilities(provider),
    }
  }
}
