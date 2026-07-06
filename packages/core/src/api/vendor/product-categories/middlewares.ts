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
import { createLinkBody } from "@medusajs/medusa/api/utils/validators"

import * as QueryConfig from "./query-config"
import {
  VendorCreateProductCategoryBody,
  VendorGetProductCategoriesParams,
  VendorGetProductCategoryParams,
  VendorUpdateProductCategoryBody,
} from "./validators"

const applySellerCategoryLinkFilter = (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  req.filterableFields.seller_id = req.seller_context!.seller_id

  return maybeApplyLinkFilter({
    entryPoint: "product_category_seller",
    resourceId: "product_category_id",
    filterableField: "seller_id",
  })(req, res, next)
}

export const vendorProductCategoriesMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/vendor/product-categories",
    middlewares: [
      validateAndTransformQuery(
        VendorGetProductCategoriesParams,
        QueryConfig.listTransformQueryConfig
      ),
      applySellerCategoryLinkFilter,
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/product-categories",
    middlewares: [
      validateAndTransformBody(VendorCreateProductCategoryBody),
      validateAndTransformQuery(
        VendorGetProductCategoryParams,
        QueryConfig.retrieveTransformQueryConfig
      ),
    ],
  },
  {
    method: ["GET"],
    matcher: "/vendor/product-categories/:id",
    middlewares: [
      validateAndTransformQuery(
        VendorGetProductCategoryParams,
        QueryConfig.retrieveTransformQueryConfig
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/product-categories/:id",
    middlewares: [
      validateAndTransformBody(VendorUpdateProductCategoryBody),
      validateAndTransformQuery(
        VendorGetProductCategoryParams,
        QueryConfig.retrieveTransformQueryConfig
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/product-categories/:id/products",
    middlewares: [
      validateAndTransformBody(createLinkBody()),
      validateAndTransformQuery(
        VendorGetProductCategoryParams,
        QueryConfig.retrieveTransformQueryConfig
      ),
    ],
  },
]
