import { asFunction, Lifetime } from "@medusajs/framework/awilix"
import { moduleProviderLoader } from "@medusajs/framework/modules-sdk"
import {
  LoaderOptions,
  MedusaContainer,
  ModuleProvider,
  ModulesSdkTypes,
} from "@medusajs/framework/types"

import { IntegrationProviderRegistrationPrefix } from "../services/integration-provider-service"

type ProviderClass = {
  new (container: Record<string, unknown>, options: Record<string, unknown>): unknown
  identifier?: string
  LIFE_TIME?: (typeof Lifetime)[keyof typeof Lifetime]
}

/**
 * Registers every provider from the module options
 * (`providers: [{ resolve, id, options }]`) in the module container under
 * `integration_provider_<id>`. The configured `id` is the provider id persisted
 * on store_integration rows, so it must be unique and stable.
 *
 * Unlike the payout module, any number of providers (including none) is valid.
 */
const registrationFn = async (
  klass: ProviderClass,
  container: MedusaContainer,
  pluginOptions: { id?: string; options?: Record<string, unknown> }
) => {
  const id = pluginOptions.id ?? klass.identifier
  if (!id) {
    throw new Error(
      "Integration providers need an `id` in medusa-config or a static `identifier`."
    )
  }

  container.register({
    [`${IntegrationProviderRegistrationPrefix}${id}`]: asFunction(
      (cradle) => new klass(cradle, pluginOptions.options ?? {}),
      { lifetime: klass.LIFE_TIME || Lifetime.SINGLETON }
    ),
  })
}

export default async ({
  container,
  options,
}: LoaderOptions<
  (
    | ModulesSdkTypes.ModuleServiceInitializeOptions
    | ModulesSdkTypes.ModuleServiceInitializeCustomDataLayerOptions
  ) & { providers?: ModuleProvider[] }
>): Promise<void> => {
  const providers = options?.providers ?? []
  if (!providers.length) {
    return
  }

  await moduleProviderLoader({
    container,
    providers,
    registerServiceFn: registrationFn,
  })
}
