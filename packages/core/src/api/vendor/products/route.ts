import { createProductsWorkflow } from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { IFulfillmentModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import { VendorCreateProductType, VendorGetProductsParamsType } from "./validators"

export const GET = async (
  req: AuthenticatedMedusaRequest<VendorGetProductsParamsType>,
  res: MedusaResponse<HttpTypes.VendorProductListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: products, metadata } = await query.graph({
    entity: "product",
    fields: req.queryConfig.fields,
    filters: req.filterableFields,
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
 * Checkout rejects a cart whose shippable items carry no shipping profile
 * matching the chosen shipping option, and the vendor UI never sends one. Default
 * to the profile the seller's own shipping options use (created at onboarding),
 * falling back to the project's default profile.
 */
async function resolveDefaultShippingProfileId(
  scope: MedusaContainer,
  sellerId: string
): Promise<string | undefined> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["shipping_options.shipping_profile_id"],
    filters: { id: sellerId },
  })

  const options =
    (sellers[0] as
      | { shipping_options?: ({ shipping_profile_id?: string | null } | null)[] }
      | undefined)?.shipping_options ?? []
  const fromOptions = options.find((o) => o?.shipping_profile_id)
    ?.shipping_profile_id
  if (fromOptions) {
    return fromOptions
  }

  const fulfillmentModule = scope.resolve<IFulfillmentModuleService>(
    Modules.FULFILLMENT
  )
  const [defaultProfile] = await fulfillmentModule.listShippingProfiles(
    { type: "default" },
    { take: 1 }
  )
  return defaultProfile?.id
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreateProductType>,
  res: MedusaResponse<HttpTypes.VendorProductResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const sellerId =  req.seller_context!.seller_id
  const { additional_data, ...productData } = req.validatedBody

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
