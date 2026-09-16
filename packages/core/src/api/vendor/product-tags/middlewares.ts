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

import { vendorProductTagsQueryConfig } from "./query-config"
import {
  VendorCreateProductTagBody,
  VendorGetProductTagParams,
  VendorGetProductTagsParams,
} from "./validators"

const applySellerTagLinkFilter = (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  req.filterableFields.seller_id = req.seller_context!.seller_id

  return maybeApplyLinkFilter({
    entryPoint: "product_tag_seller",
    resourceId: "product_tag_id",
    filterableField: "seller_id",
  })(req, res, next)
}

export const vendorProductTagsMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/vendor/product-tags",
    middlewares: [
      validateAndTransformQuery(
        VendorGetProductTagsParams,
        vendorProductTagsQueryConfig.list
      ),
      applySellerTagLinkFilter,
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/product-tags",
    middlewares: [
      validateAndTransformBody(VendorCreateProductTagBody),
      validateAndTransformQuery(
        VendorGetProductTagParams,
        vendorProductTagsQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["GET"],
    matcher: "/vendor/product-tags/:id",
    middlewares: [
      validateAndTransformQuery(
        VendorGetProductTagParams,
        vendorProductTagsQueryConfig.retrieve
      ),
    ],
  },
]
