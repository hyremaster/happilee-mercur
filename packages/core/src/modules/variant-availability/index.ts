import { Module } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import VariantAvailabilityModuleService from "./service"

export const VARIANT_AVAILABILITY_MODULE = MercurModules.VARIANT_AVAILABILITY
export { VariantAvailabilityModuleService }
export { isVariantAvailable } from "./utils/is-variant-available"
export type { VariantAvailabilityState } from "./utils/is-variant-available"

export default Module(VARIANT_AVAILABILITY_MODULE, {
  service: VariantAvailabilityModuleService,
})
