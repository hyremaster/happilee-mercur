import { MedusaError } from "@medusajs/framework/utils"
import { IIntegrationProvider, IntegrationProviderDTO } from "@mercurjs/types"

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
    return Array.from(this.providers_.entries())
      .map(([id, provider]) => ({ id, ...provider.getDefinition() }))
      .sort((a, b) => a.title.localeCompare(b.title))
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
    return { id, ...this.retrieve(id).getDefinition() }
  }
}
