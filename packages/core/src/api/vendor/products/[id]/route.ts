import { deleteProductsWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import {
  assertStoreHandleAvailable,
  setStoreProductHandle,
  toStoreHandle,
} from "../../../../workflows/marketplace-profile/utils/store-product-handles"
import { validateSellerProduct } from "../helpers"
import { VendorUpdateProductType } from "../validators"
import { transformProductWithInformationalAttributes } from "../utils/transform-product-attributes"
import { updateProductWithVariantImagesWorkflow } from "../../../../workflows/product-attribute/workflows/update-product-with-variant-images"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorProductResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const sellerId =  req.seller_context!.seller_id

  await validateSellerProduct(req.scope, sellerId, req.params.id)

  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: req.queryConfig.fields,
    filters: { id: req.params.id },
  })

  if (!product) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product with id ${req.params.id} was not found`
    )
  }

  const transformedProduct = transformProductWithInformationalAttributes(
    product as any
  )

  res.json({ product: transformedProduct })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdateProductType>,
  res: MedusaResponse<HttpTypes.VendorProductResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const sellerId =  req.seller_context!.seller_id
  const { additional_data, handle, ...update } = req.validatedBody

  await validateSellerProduct(req.scope, sellerId, req.params.id)

  // A handle change is store-scoped; Medusa's internal product.handle stays.
  const storeHandle = handle === undefined ? undefined : toStoreHandle(handle)
  if (storeHandle) {
    await assertStoreHandleAvailable(
      req.scope,
      sellerId,
      storeHandle,
      req.params.id
    )
  }

  const { result } = await updateProductWithVariantImagesWorkflow(
    req.scope
  ).run({
    input: {
      selector: { id: req.params.id },
      update,
      additional_data: {
        ...additional_data,
        seller_id: sellerId,
      },
    },
  })

  if (storeHandle) {
    await setStoreProductHandle(req.scope, {
      product_id: req.params.id,
      seller_id: sellerId,
      handle: storeHandle,
    })
  }

  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: req.queryConfig.fields,
    filters: { id: result[0].id },
  })

  const transformedProduct = transformProductWithInformationalAttributes(
    product as any
  )

  res.json({ product: transformedProduct })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorDeleteResponse>
) => {
  const sellerId =  req.seller_context!.seller_id

  await validateSellerProduct(req.scope, sellerId, req.params.id)

  await deleteProductsWorkflow(req.scope).run({
    input: { ids: [req.params.id] },
  })

  res.json({
    id: req.params.id,
    object: "product",
    deleted: true,
  })
}
