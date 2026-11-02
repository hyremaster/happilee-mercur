import {
  createProductsWorkflow,
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/core-flows"
import { CreateProductWorkflowInputDTO, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"

import type IntegrationModuleService from "../../../modules/integration/service"
import { toSyncRunLogMessage } from "../../../modules/integration/utils/integration-error"
import type { ProjectionItem } from "../../../modules/integration/utils/projection-staging"
import { resolveDefaultShippingProfileId } from "../../marketplace-profile/utils/default-shipping-profile"
import {
  assertStoreHandleAvailable,
  internalProductHandle,
  toStoreHandle,
} from "../../marketplace-profile/utils/store-product-handles"

type Scope = { seller_id: string; provider_id: string }

export type ProjectionCounts = {
  created: number
  updated: number
  unpublished: number
  skipped: number
  failed: number
}

/** What the sync owns on a product, kept under `metadata.integration`. */
type IntegrationMetadata = {
  provider_id: string
  seller_id: string
  external_id: string
  hsn_code: string | null
  tax_rate: number | null
  /** The title last written by the sync; a different title means it was edited. */
  synced_title: string
}

type ExistingProduct = {
  id: string
  title: string
  status: string
  metadata: Record<string, unknown> | null
  variants: { id: string; sku: string | null; barcode: string | null; title: string }[]
}

const OPTION = "Default"

/** Providers often send names in capitals; other names are kept as written. */
export function toProductTitle(name: string): string {
  if (name !== name.toUpperCase()) {
    return name
  }
  return name
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_, prefix: string, letter: string) => prefix + letter.toUpperCase())
}

const integrationMetadata = (scope: Scope, item: ProjectionItem, syncedTitle: string): IntegrationMetadata => ({
  provider_id: scope.provider_id,
  seller_id: scope.seller_id,
  external_id: item.external_id,
  hsn_code: item.hsn_code,
  tax_rate: item.tax_rate,
  synced_title: syncedTitle,
})

const storedMetadata = (product: { metadata?: Record<string, unknown> | null }) =>
  (product.metadata?.integration ?? null) as IntegrationMetadata | null

const belongsTo = (product: ExistingProduct, scope: Scope, externalId: string) => {
  const stored = storedMetadata(product)
  return (
    stored?.seller_id === scope.seller_id &&
    stored.provider_id === scope.provider_id &&
    stored.external_id === externalId
  )
}

const PRODUCT_FIELDS = [
  "id",
  "title",
  "status",
  "metadata",
  "variants.id",
  "variants.sku",
  "variants.barcode",
  "variants.title",
]

/**
 * Applies one page of staged items to Medusa products.
 *
 * - Eligible with no product: create a draft. Never published automatically.
 * - Eligible with a product: update what the sync owns (sku, barcode, tax data)
 *   and the title only if nobody edited it. Description, images, categories and
 *   status belong to the store.
 * - Blocked with a product: move it to draft, never delete. It stays draft when
 *   the item becomes eligible again, so a person decides on re-publishing.
 *
 * A failing item doesn't stop the others: it stays pending for the next run.
 */
export async function projectItemsPage(
  container: MedusaContainer,
  service: IntegrationModuleService,
  scope: Scope,
  items: ProjectionItem[]
): Promise<ProjectionCounts> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const counts: ProjectionCounts = { created: 0, updated: 0, unpublished: 0, skipped: 0, failed: 0 }
  const projected: Parameters<IntegrationModuleService["recordProjectedItems"]>[1] = []

  const fail = async (item: ProjectionItem, error: unknown) => {
    const reason = toSyncRunLogMessage(error)
    counts.failed++
    logger.error(
      `Product projection failed for item ${item.external_id} of store ${scope.seller_id} / ${scope.provider_id}: ${reason}`
    )
    await service.recordFailedProjection(scope, item.external_id, reason)
  }

  const loadProducts = async (ids: string[]) => {
    if (!ids.length) {
      return new Map<string, ExistingProduct>()
    }
    const { data } = await query.graph({
      entity: "product",
      fields: PRODUCT_FIELDS,
      filters: { id: ids },
    })
    return new Map((data as unknown as ExistingProduct[]).map((p) => [p.id, p]))
  }

  // A product made by a run that crashed before saving the mapping is adopted,
  // not duplicated. A sku held by anything else is a failure, not a takeover.
  const withoutProduct = items.filter((item) => !item.product_id)
  const skus = withoutProduct.map((item) => item.sku).filter((sku): sku is string => !!sku)
  const { data: skuOwners } = skus.length
    ? await query.graph({
        entity: "variant",
        fields: ["sku", "product_id"],
        filters: { sku: skus },
      })
    : { data: [] }
  const productBySku = new Map(
    (skuOwners as { sku: string; product_id: string }[]).map((v) => [v.sku, v.product_id])
  )

  const loaded = await loadProducts([
    ...items.map((item) => item.product_id).filter((id): id is string => !!id),
    ...productBySku.values(),
  ])

  const toCreate: ProjectionItem[] = []
  const toUpdate: { item: ProjectionItem; product: ExistingProduct }[] = []

  for (const item of items) {
    if (item.product_id) {
      const product = loaded.get(item.product_id)
      if (!product) {
        // Deleted in Medusa: that was a person's decision, so it isn't recreated.
        counts.skipped++
        projected.push({
          external_id: item.external_id,
          version: item.version,
          product_id: item.product_id,
          variant_id: item.variant_id,
        })
      } else {
        toUpdate.push({ item, product })
      }
      continue
    }

    if (!item.sku) {
      await fail(item, new Error("The item has no sku."))
      continue
    }
    const ownerId = productBySku.get(item.sku)
    if (!ownerId) {
      toCreate.push(item)
      continue
    }
    const owner = loaded.get(ownerId)
    if (owner && belongsTo(owner, scope, item.external_id)) {
      toUpdate.push({ item, product: owner })
    } else {
      await fail(item, new Error(`Sku ${item.sku} is already used by another product.`))
    }
  }

  for (const { item, product } of toUpdate) {
    try {
      if (!item.is_eligible) {
        if (product.status === ProductStatus.PUBLISHED || product.status === ProductStatus.PROPOSED) {
          await updateProductsWorkflow(container).run({
            input: { products: [{ id: product.id, status: ProductStatus.DRAFT }] },
          })
          counts.unpublished++
        }
      } else if (await updateOwnedFields(container, scope, item, product)) {
        counts.updated++
      }
      projected.push({
        external_id: item.external_id,
        version: item.version,
        product_id: product.id,
        variant_id: product.variants[0]?.id ?? item.variant_id,
      })
    } catch (e) {
      await fail(item, e)
    }
  }

  if (toCreate.length) {
    const { data: stores } = await query.graph({
      entity: "store",
      fields: ["default_sales_channel_id"],
    })
    const salesChannelId = (stores[0] as { default_sales_channel_id?: string | null } | undefined)
      ?.default_sales_channel_id
    const shippingProfileId = await resolveDefaultShippingProfileId(container, scope.seller_id)

    const prepared: { item: ProjectionItem; input: CreateProductWorkflowInputDTO; storeHandle: string }[] = []
    for (const item of toCreate) {
      try {
        const title = toProductTitle(item.name)
        // The id keeps handles unique: provider names can repeat.
        const storeHandle = toStoreHandle(`${item.name} ${item.external_id}`)
        await assertStoreHandleAvailable(container, scope.seller_id, storeHandle)
        prepared.push({
          item,
          storeHandle,
          input: {
            title,
            handle: await internalProductHandle(container, scope.seller_id, storeHandle),
            status: ProductStatus.DRAFT,
            is_giftcard: false,
            discountable: true,
            shipping_profile_id: shippingProfileId,
            sales_channels: salesChannelId ? [{ id: salesChannelId }] : undefined,
            metadata: { integration: integrationMetadata(scope, item, title) },
            options: [{ title: OPTION, values: [OPTION] }],
            variants: [
              {
                title,
                sku: item.sku as string,
                barcode: item.barcode ?? undefined,
                manage_inventory: true,
                allow_backorder: false,
                options: { [OPTION]: OPTION },
                prices: [],
              },
            ],
          },
        })
      } catch (e) {
        await fail(item, e)
      }
    }

    const create = async (entries: typeof prepared) => {
      const { result } = await createProductsWorkflow(container).run({
        input: {
          products: entries.map((entry) => entry.input),
          additional_data: {
            seller_id: scope.seller_id,
            store_handles: Object.fromEntries(
              entries.map((entry) => [entry.input.handle, entry.storeHandle])
            ),
          },
        },
      })
      for (const product of result) {
        const externalId = storedMetadata(product)?.external_id
        const entry = entries.find((e) => e.item.external_id === externalId)
        if (entry) {
          counts.created++
          projected.push({
            external_id: entry.item.external_id,
            version: entry.item.version,
            product_id: product.id,
            variant_id: product.variants?.[0]?.id ?? null,
          })
        }
      }
    }

    if (prepared.length) {
      try {
        await create(prepared)
      } catch {
        // The batch rolled back. One at a time, so only the bad item fails.
        for (const entry of prepared) {
          try {
            await create([entry])
          } catch (e) {
            await fail(entry.item, e)
          }
        }
      }
    }
  }

  await service.recordProjectedItems(scope, projected)
  return counts
}

/** Returns true when anything changed. */
async function updateOwnedFields(
  container: MedusaContainer,
  scope: Scope,
  item: ProjectionItem,
  product: ExistingProduct
): Promise<boolean> {
  const stored = storedMetadata(product)
  const nextTitle = toProductTitle(item.name)
  const titleUnedited = stored?.synced_title === product.title
  const title = titleUnedited ? nextTitle : product.title
  const syncedTitle = titleUnedited ? nextTitle : stored?.synced_title ?? product.title
  const metadata = integrationMetadata(scope, item, syncedTitle)

  const variant = product.variants[0]
  const barcode = item.barcode ?? null
  const variantChanged =
    !!variant &&
    (variant.sku !== item.sku ||
      (variant.barcode ?? null) !== barcode ||
      (titleUnedited && variant.title !== nextTitle))
  const productChanged =
    title !== product.title || JSON.stringify(stored) !== JSON.stringify(metadata)

  if (productChanged) {
    await updateProductsWorkflow(container).run({
      input: {
        products: [
          {
            id: product.id,
            title,
            // Whole-object update: keep what others stored in metadata.
            metadata: { ...product.metadata, integration: metadata },
          },
        ],
      },
    })
  }
  if (variantChanged) {
    await updateProductVariantsWorkflow(container).run({
      input: {
        product_variants: [
          {
            id: variant.id,
            sku: item.sku,
            barcode,
            ...(titleUnedited ? { title: nextTitle } : {}),
          },
        ],
      },
    })
  }
  return productChanged || variantChanged
}
