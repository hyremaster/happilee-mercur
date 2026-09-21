import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"

import VariantAvailabilityModule from "../modules/variant-availability"

// One availability record per variant; removed together with the variant.
export default defineLink(ProductModule.linkable.productVariant, {
  linkable: VariantAvailabilityModule.linkable.variantAvailability,
  deleteCascade: true,
})
