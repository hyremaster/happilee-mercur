import { createProductsWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import {
  assertStoreHandleAvailable,
  internalProductHandle,
  productIdsForStoreHandle,
  toStoreHandle,
} from "../../../workflows/marketplace-profile/utils/store-product-handles"
import { resolveDefaultShippingProfileId } from "../../../workflows/marketplace-profile/utils/default-shipping-profile"
import { VendorCreateProductType, VendorGetProductsParamsType } from "./validators"

export const GET = async (
  req: AuthenticatedMedusaRequest<VendorGetProductsParamsType>,
  res: MedusaResponse<HttpTypes.VendorProductListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const filters = await resolveStoreHandleFilter(req)

  const { data: products, metadata } = await query.graph({
    entity: "product",
    fields: req.queryConfig.fields,
    filters,
    pagination: req.queryConfig.pagination,
  })

  res.json({
    products,
    count: metadata?.count ?? 0,
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? 0,
  })
}

/**
 * `?handle=` filters by the store handle the vendor sees, not Medusa's internal
 * product.handle.
 */
async function resolveStoreHandleFilter(
  req: AuthenticatedMedusaRequest<VendorGetProductsParamsType>
): Promise<Record<string, unknown>> {
  const { handle, ...filters } = req.filterableFields as Record<string, unknown>
  if (handle === undefined) {
    return req.filterableFields
  }

  const sellerId = req.seller_context!.seller_id
  const handles = (Array.isArray(handle) ? handle : [handle]).filter(
    (h): h is string => typeof h === "string"
  )
  const matched = new Set(
    (
      await Promise.all(
        handles.map((h) => productIdsForStoreHandle(req.scope, sellerId, h))
      )
    ).flat()
  )

  // The seller link filter has already narrowed `id` to this store's products.
  const scoped = filters.id
  const ids = scoped === undefined
    ? [...matched]
    : (Array.isArray(scoped) ? scoped : [scoped]).filter(
        (id): id is string => typeof id === "string" && matched.has(id)
      )

  return { ...filters, id: ids }
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreateProductType>,
  res: MedusaResponse<HttpTypes.VendorProductResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const sellerId =  req.seller_context!.seller_id
  const { additional_data, ...productData } = req.validatedBody

  // The vendor's handle only has to be unique within the store; Medusa's
  // product.handle gets an internal, marketplace-unique value.
  const storeHandle = toStoreHandle(productData.handle || productData.title)
  await assertStoreHandleAvailable(req.scope, sellerId, storeHandle)
  productData.handle = await internalProductHandle(
    req.scope,
    sellerId,
    storeHandle
  )

  if (!productData.shipping_profile_id) {
    productData.shipping_profile_id = await resolveDefaultShippingProfileId(
      req.scope,
      sellerId
    )
  }

  const {
    result: [createdProduct],
  } = await createProductsWorkflow(req.scope).run({
    input: {
      products: [productData],
      additional_data: {
        ...additional_data,
        seller_id: sellerId,
        store_handle: storeHandle,
      },
    },
  })

  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: req.queryConfig.fields,
    filters: { id: createdProduct.id },
  })

  res.status(201).json({ product })
}
