import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import {
  isVariantAvailable,
  VariantAvailabilityState,
} from "../../../modules/variant-availability/utils/is-variant-available"

type VariantAvailabilityRow = {
  id: string
  title?: string | null
  product?: { id: string; title?: string | null } | null
  variant_availability?: VariantAvailabilityState | null
}

/**
 * Throw NOT_ALLOWED when any of the given variants is currently marked
 * unavailable by its vendor. Shared by the add-to-cart / update-line-item hooks
 * and cart completion so an item sold out after it entered a cart still cannot
 * be ordered.
 */
export async function assertVariantsAvailable(
  container: MedusaContainer,
  variantIds: (string | null | undefined)[]
): Promise<void> {
  const ids = Array.from(
    new Set(variantIds.filter((id): id is string => !!id))
  )
  if (!ids.length) {
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "title",
      "product.id",
      "product.title",
      "variant_availability.is_available",
      "variant_availability.unavailable_until",
    ],
    filters: { id: ids },
  })

  const now = new Date()
  const unavailable = (data as VariantAvailabilityRow[]).filter(
    (variant) => !isVariantAvailable(variant.variant_availability, now)
  )

  if (!unavailable.length) {
    return
  }

  // Name the variant only when the product has several to choose from; a
  // single-variant product's variant title ("Default variant") means nothing to
  // a shopper. Counted with a product query: nesting product.variants under the
  // variant query returns only the queried variant.
  const productIds = Array.from(
    new Set(
      unavailable
        .map((variant) => variant.product?.id)
        .filter((id): id is string => !!id)
    )
  )
  const { data: products } = productIds.length
    ? await query.graph({
        entity: "product",
        fields: ["id", "variants.id"],
        filters: { id: productIds },
      })
    : { data: [] }
  const variantCountByProduct = new Map(
    (products as { id: string; variants?: unknown[] | null }[]).map((p) => [
      p.id,
      (p.variants ?? []).length,
    ])
  )

  const names = unavailable.map((variant) => {
    const product = variant.product?.title
    const hasSiblings =
      (variantCountByProduct.get(variant.product?.id ?? "") ?? 0) > 1
    if (!product) {
      return variant.title ?? variant.id
    }
    return hasSiblings && variant.title
      ? `${product} (${variant.title})`
      : product
  })

  throw new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    `Currently unavailable: ${names.join(", ")}.`
  )
}
