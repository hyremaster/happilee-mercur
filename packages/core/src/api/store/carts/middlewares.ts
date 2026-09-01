import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MiddlewareRoute } from "@medusajs/medusa"

import { storeCompleteCartQueryConfig } from "./[id]/complete/query-config"
import { StoreCompleteCartParams } from "./[id]/complete/validators"

/**
 * Require geo coordinates on the cart shipping address.
 *
 * The base /store/carts create + /store/carts/:id update routes are native
 * Medusa and accept a free-form `shipping_address.metadata`. This marketplace
 * requires every shipping address to carry `latitude`/`longitude` (used
 * downstream for delivery-area matching), so we enforce their presence, type,
 * and range here.
 *
 * Runs on the raw parsed body (`req.body`) before the handler; a failure throws
 * INVALID_DATA which the framework maps to a 400.
 *
 * On update (:id) the shipping address is optional — only validate when the
 * request actually sets one. On create the address (with coords) is mandatory.
 */
const requireShippingGeoMetadata = (
  { addressRequired }: { addressRequired: boolean }
) => {
  return (
    req: MedusaRequest,
    _res: MedusaResponse,
    next: MedusaNextFunction
  ) => {
    const body = req.body as {
      shipping_address?: { metadata?: Record<string, unknown> } | string
    }

    const shippingAddress = body?.shipping_address

    // No address on this request. Required on create, optional on update.
    if (!shippingAddress) {
      if (addressRequired) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "shipping_address is required and must include metadata.latitude and metadata.longitude"
        )
      }
      return next()
    }

    // A string address is a reference to an existing address id — coords were
    // validated when that address was first set, so nothing to check here.
    if (typeof shippingAddress === "string") {
      return next()
    }

    const metadata = shippingAddress.metadata
    const latitude = metadata?.latitude
    const longitude = metadata?.longitude

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "shipping_address.metadata.latitude and shipping_address.metadata.longitude are required and must be numbers"
      )
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "shipping_address.metadata.latitude must be between -90 and 90 and metadata.longitude between -180 and 180"
      )
    }

    return next()
  }
}

export const storeCartsMiddlewares: MiddlewareRoute[] = [
  {
    // Create + update: a shipping address is optional (the storefront may set
    // it later at checkout), but when one IS provided it must carry geo coords.
    // The cart-completion delivery check then enforces that coords exist before
    // an order can be placed.
    method: ["POST"],
    matcher: "/store/carts",
    middlewares: [requireShippingGeoMetadata({ addressRequired: false })],
  },
  {
    method: ["POST"],
    matcher: "/store/carts/:id",
    middlewares: [requireShippingGeoMetadata({ addressRequired: false })],
  },
  {
    method: ["POST"],
    matcher: "/store/carts/:id/complete",
    middlewares: [
      validateAndTransformQuery(
        StoreCompleteCartParams,
        storeCompleteCartQueryConfig
      ),
    ],
  },
]
