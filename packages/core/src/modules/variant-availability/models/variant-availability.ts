import { model } from "@medusajs/framework/utils"

/**
 * Vendor-controlled sale availability of a product variant, independent of
 * inventory. Lets a store (typically a restaurant, whose variants are not
 * inventory-managed) mark a variant as sold out without touching stock.
 *
 * Linked one-to-one to the product variant. A variant with no record is
 * available. `unavailable_until` makes the flag expire on its own: once that
 * moment passes the variant counts as available again.
 */
const VariantAvailability = model.define("variant_availability", {
  id: model.id({ prefix: "varavl" }).primaryKey(),
  is_available: model.boolean().default(true),
  unavailable_until: model.dateTime().nullable(),
})

export default VariantAvailability
