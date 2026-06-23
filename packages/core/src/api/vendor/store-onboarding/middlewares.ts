import { MiddlewareRoute } from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"

import {
  vendorStoreQueryConfig,
  vendorStoreLocationQueryConfig,
} from "./query-config"
import {
  VendorGetStoresParams,
  VendorGetStoreParams,
  VendorCreateStore,
  VendorUpdateStore,
  VendorGetStoreLocationsParams,
  VendorCreateStoreLocation,
  VendorUpdateStoreLocation,
} from "./validators"

export const vendorStoreOnboardingMiddlewares: MiddlewareRoute[] = [
  // GET /vendor/store-onboarding — list owned stores
  {
    method: ["GET"],
    matcher: "/vendor/store-onboarding",
    middlewares: [
      validateAndTransformQuery(
        VendorGetStoresParams,
        vendorStoreQueryConfig.list
      ),
    ],
  },
  // POST /vendor/store-onboarding — create store
  {
    method: ["POST"],
    matcher: "/vendor/store-onboarding",
    middlewares: [
      validateAndTransformBody(VendorCreateStore),
      validateAndTransformQuery(
        VendorGetStoreParams,
        vendorStoreQueryConfig.retrieve
      ),
    ],
  },
  // GET /vendor/store-onboarding/:id — store detail
  {
    method: ["GET"],
    matcher: "/vendor/store-onboarding/:id",
    middlewares: [
      validateAndTransformQuery(
        VendorGetStoreParams,
        vendorStoreQueryConfig.retrieve
      ),
    ],
  },
  // POST /vendor/store-onboarding/:id — update store extension data
  {
    method: ["POST"],
    matcher: "/vendor/store-onboarding/:id",
    middlewares: [
      validateAndTransformBody(VendorUpdateStore),
      validateAndTransformQuery(
        VendorGetStoreParams,
        vendorStoreQueryConfig.retrieve
      ),
    ],
  },
  // GET /vendor/store-onboarding/:id/locations — list fulfillment centres
  {
    method: ["GET"],
    matcher: "/vendor/store-onboarding/:id/locations",
    middlewares: [
      validateAndTransformQuery(
        VendorGetStoreLocationsParams,
        vendorStoreLocationQueryConfig.list
      ),
    ],
  },
  // POST /vendor/store-onboarding/:id/locations — add fulfillment centre
  {
    method: ["POST"],
    matcher: "/vendor/store-onboarding/:id/locations",
    middlewares: [
      validateAndTransformBody(VendorCreateStoreLocation),
      validateAndTransformQuery(
        VendorGetStoreParams,
        vendorStoreLocationQueryConfig.retrieve
      ),
    ],
  },
  // POST /vendor/store-onboarding/:id/locations/:location_id — update centre
  {
    method: ["POST"],
    matcher: "/vendor/store-onboarding/:id/locations/:location_id",
    middlewares: [
      validateAndTransformBody(VendorUpdateStoreLocation),
      validateAndTransformQuery(
        VendorGetStoreParams,
        vendorStoreLocationQueryConfig.retrieve
      ),
    ],
  },
  // DELETE /vendor/store-onboarding/:id/locations/:location_id — remove centre
  {
    method: ["DELETE"],
    matcher: "/vendor/store-onboarding/:id/locations/:location_id",
    middlewares: [],
  },
]
