import { MedusaService } from "@medusajs/framework/utils"

import VariantAvailability from "./models/variant-availability"

class VariantAvailabilityModuleService extends MedusaService({
  VariantAvailability,
}) {}

export default VariantAvailabilityModuleService
