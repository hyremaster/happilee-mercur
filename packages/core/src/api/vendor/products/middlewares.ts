import {
  AuthenticatedMedusaRequest,
  maybeApplyLinkFilter,
  MedusaNextFunction,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"

import {
  vendorProductQueryConfig,
  vendorProductVariantQueryConfig,
} from "./query-config"
import {
  VendorAddProductAttribute,
  VendorBatchVariantImages,
  VendorCreateProduct,
  VendorCreateProductOption,
  VendorCreateProductVariant,
  VendorGetProductParams,
  VendorGetProductsParams,
  VendorGetProductVariantParams,
  VendorGetProductVariantsParams,
  VendorUpdateProduct,
  VendorUpdateProductAttribute,
  VendorUpdateProductOption,
  VendorSetVariantAvailability,
  VendorUpdateProductVariant,
} from "./validators"
import { maybeApplyPriceListsFilter } from "@medusajs/medusa/api/admin/products/utils/maybe-apply-price-lists-filter"
import { applyStoreHandles } from "../../../workflows/marketplace-profile/utils/store-product-handles"

type ProductBody = {
  product?: { id?: string; handle?: string | null }
  products?: { id?: string; handle?: string | null }[]
}

/**
 * Vendors see each product's store-scoped handle, not Medusa's internal
 * product.handle, in every /vendor/products response.
 */
const withStoreProductHandles = (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const json = res.json.bind(res)
  res.json = ((body: ProductBody) => {
    const products = [
      ...(body?.product ? [body.product] : []),
      ...(Array.isArray(body?.products) ? body.products : []),
    ]
    if (!products.length) {
      return json(body)
    }
    applyStoreHandles(req.scope, products)
      .then(() => json(body))
      .catch(next)
    return res
  }) as typeof res.json
  next()
}

const applySellerProductLinkFilter = (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  req.filterableFields.seller_id =  req.seller_context!.seller_id

  return maybeApplyLinkFilter({
    entryPoint: "product_seller",
    resourceId: "product_id",
    filterableField: "seller_id",
  })(req, res, next)
}

export const vendorProductsMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/vendor/products*",
    middlewares: [withStoreProductHandles],
  },
  {
    method: ["GET"],
    matcher: "/vendor/products",
    middlewares: [
      validateAndTransformQuery(
        VendorGetProductsParams,
        vendorProductQueryConfig.list
      ),
      applySellerProductLinkFilter,
      maybeApplyPriceListsFilter()
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products",
    middlewares: [
      validateAndTransformBody(VendorCreateProduct),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["GET"],
    matcher: "/vendor/products/:id",
    middlewares: [
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products/:id",
    middlewares: [
      validateAndTransformBody(VendorUpdateProduct),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/products/:id",
    middlewares: [],
  },
  {
    method: ["GET"],
    matcher: "/vendor/products/:id/variants",
    middlewares: [
      validateAndTransformQuery(
        VendorGetProductVariantsParams,
        vendorProductVariantQueryConfig.list
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products/:id/variants",
    middlewares: [
      validateAndTransformBody(VendorCreateProductVariant),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["GET"],
    matcher: "/vendor/products/:id/variants/:variant_id",
    middlewares: [
      validateAndTransformQuery(
        VendorGetProductVariantParams,
        vendorProductVariantQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products/:id/variants/:variant_id",
    middlewares: [
      validateAndTransformBody(VendorUpdateProductVariant),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/products/:id/variants/:variant_id",
    middlewares: [],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products/:id/options",
    middlewares: [
      validateAndTransformBody(VendorCreateProductOption),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products/:id/options/:option_id",
    middlewares: [
      validateAndTransformBody(VendorUpdateProductOption),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/products/:id/options/:option_id",
    middlewares: [],
  },
  // Attribute management routes
  {
    method: ["POST"],
    matcher: "/vendor/products/:id/attributes",
    middlewares: [
      validateAndTransformBody(VendorAddProductAttribute),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products/:id/attributes/:attribute_id",
    middlewares: [
      validateAndTransformBody(VendorUpdateProductAttribute),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/products/:id/attributes/:attribute_id",
    middlewares: [],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products/:id/variants/:variant_id/availability",
    middlewares: [validateAndTransformBody(VendorSetVariantAvailability)],
  },
  // Variant media route
  {
    method: ["POST"],
    matcher: "/vendor/products/:id/variants/:variant_id/media",
    middlewares: [
      validateAndTransformBody(VendorBatchVariantImages),
    ],
  },
]
