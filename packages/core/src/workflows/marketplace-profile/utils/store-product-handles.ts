import { IProductModuleService, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  toHandle,
} from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type MarketplaceProfileModuleService from "../../../modules/marketplace-profile/service"

/**
 * Store-scoped product handles.
 *
 * Medusa's `product.handle` is unique across the marketplace. Vendors instead
 * see and edit a handle that only has to be unique within their store (kept in
 * the `store_product_handle` table), while `product.handle` holds an internal
 * value built from the store handle so it never collides across stores.
 *
 * Products without a row (created before this table existed, or outside the
 * vendor API) fall back to their Medusa handle.
 */

type ProductWithHandle = { id?: string; handle?: string | null }

const profileService = (container: MedusaContainer) =>
  container.resolve<MarketplaceProfileModuleService>(
    MercurModules.MARKETPLACE_PROFILE
  )

const productService = (container: MedusaContainer) =>
  container.resolve<IProductModuleService>(Modules.PRODUCT)

export function toStoreHandle(value: string): string {
  const handle = toHandle(value.trim())
  if (!handle) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A product handle needs at least one letter or number."
    )
  }
  return handle
}

/** Seller-linked products (not in `exceptProductId`) that still use their Medusa handle as the store handle. */
async function legacyProductIdsWithHandle(
  container: MedusaContainer,
  sellerId: string,
  handle: string
): Promise<string[]> {
  const products = await productService(container).listProducts(
    { handle },
    { select: ["id"] }
  )
  if (!products.length) {
    return []
  }

  const productIds = products.map((p) => p.id)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: links } = await query.graph({
    entity: "product_seller",
    fields: ["product_id"],
    filters: { product_id: productIds, seller_id: sellerId },
  })
  const linked = (links as { product_id: string }[]).map((l) => l.product_id)
  if (!linked.length) {
    return []
  }

  const withRows = await profileService(container).listStoreProductHandles({
    product_id: linked,
  })
  const hasRow = new Set(withRows.map((r) => r.product_id))
  return linked.filter((id) => !hasRow.has(id))
}

/** Product ids in the store whose store handle is `handle`. */
export async function productIdsForStoreHandle(
  container: MedusaContainer,
  sellerId: string,
  handle: string
): Promise<string[]> {
  const rows = await profileService(container).listStoreProductHandles({
    seller_id: sellerId,
    handle,
  })
  const legacy = await legacyProductIdsWithHandle(container, sellerId, handle)
  return [...rows.map((r) => r.product_id), ...legacy]
}

export async function assertStoreHandleAvailable(
  container: MedusaContainer,
  sellerId: string,
  handle: string,
  exceptProductId?: string
): Promise<void> {
  const owners = await productIdsForStoreHandle(container, sellerId, handle)
  if (owners.some((id) => id !== exceptProductId)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `A product with handle "${handle}" already exists in your store.`
    )
  }
}

/**
 * The globally unique value stored in Medusa's `product.handle`: the store
 * handle prefixed with the seller's handle (both unique), with a numeric suffix
 * in the rare case that combination is taken (e.g. seller "a-b" + "c" vs
 * seller "a" + "b-c").
 */
export async function internalProductHandle(
  container: MedusaContainer,
  sellerId: string,
  storeHandle: string
): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["handle"],
    filters: { id: sellerId },
  })
  const prefix = (sellers[0] as { handle?: string | null } | undefined)?.handle
  const base = toHandle(`${prefix || sellerId}-${storeHandle}`)

  const candidates = [base, ...Array.from({ length: 19 }, (_, i) => `${base}-${i + 2}`)]
  const taken = await productService(container).listProducts(
    { handle: candidates },
    { select: ["handle"] }
  )
  const takenHandles = new Set(taken.map((p) => p.handle))
  return (
    candidates.find((candidate) => !takenHandles.has(candidate)) ??
    `${base}-${Date.now().toString(36)}`
  )
}

export async function setStoreProductHandle(
  container: MedusaContainer,
  data: { product_id: string; seller_id: string; handle: string }
): Promise<void> {
  const service = profileService(container)
  const [existing] = await service.listStoreProductHandles({
    product_id: data.product_id,
  })
  if (existing) {
    await service.updateStoreProductHandles({
      id: existing.id,
      handle: data.handle,
    })
    return
  }
  await service.createStoreProductHandles(data)
}

/** Replace `handle` on each product (in place) with its store handle. */
export async function applyStoreHandles(
  container: MedusaContainer,
  products: ProductWithHandle[]
): Promise<void> {
  const withHandle = products.filter(
    (p): p is ProductWithHandle & { id: string } =>
      !!p?.id && Object.prototype.hasOwnProperty.call(p, "handle")
  )
  if (!withHandle.length) {
    return
  }

  const rows = await profileService(container).listStoreProductHandles({
    product_id: withHandle.map((p) => p.id),
  })
  const byProduct = new Map(rows.map((r) => [r.product_id, r.handle]))

  for (const product of withHandle) {
    const storeHandle = byProduct.get(product.id)
    if (storeHandle) {
      product.handle = storeHandle
    }
  }
}
