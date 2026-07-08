import { authenticate, MiddlewareRoute } from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"

import {
  vendorStoreQueryConfig,
  vendorStoreLocationQueryConfig,
  vendorDraftQueryConfig,
} from "./query-config"
import {
  VendorGetStoresParams,
  VendorGetStoreParams,
  VendorCreateStore,
  VendorUpdateStore,
  VendorGetStoreLocationsParams,
  VendorCreateStoreLocation,
  VendorUpdateStoreLocation,
  VendorGetDraftsParams,
  VendorGetDraftParams,
  VendorCreateDraft,
  VendorSaveDraftStep,
  VendorSubmitDraft,
  VendorGetAreaSenseParams,
  VendorSaveDeliveryAreas,
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
  // GET /vendor/store-onboarding/area-sense/areas — proxy available areas
  {
    method: ["GET"],
    matcher: "/vendor/store-onboarding/area-sense/areas",
    middlewares: [validateAndTransformQuery(VendorGetAreaSenseParams, {})],
  },
  // GET/POST /vendor/store-onboarding/:id/delivery-areas — list/replace areas
  {
    method: ["GET"],
    matcher: "/vendor/store-onboarding/:id/delivery-areas",
    middlewares: [],
  },
  {
    method: ["POST"],
    matcher: "/vendor/store-onboarding/:id/delivery-areas",
    middlewares: [validateAndTransformBody(VendorSaveDeliveryAreas)],
  },
  // DELETE /vendor/store-onboarding/:id/delivery-areas/:area_sense_id
  {
    method: ["DELETE"],
    matcher: "/vendor/store-onboarding/:id/delivery-areas/:area_sense_id",
    middlewares: [],
  },
  // GET /vendor/store-onboarding/default-statuses — list default order statuses
  {
    method: ["GET"],
    matcher: "/vendor/store-onboarding/default-statuses",
    middlewares: [
      authenticate("member", ["session", "bearer"], { allowUnregistered: false }),
    ],
  },
  // GET /vendor/store-onboarding/check-handle — check handle availability
  {
    method: ["GET"],
    matcher: "/vendor/store-onboarding/check-handle",
    middlewares: [
      authenticate("member", ["session", "bearer"], { allowUnregistered: false }),
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
  // ---- Onboarding drafts (declared after /:id so they win the path overlap) ----
  // GET /vendor/store-onboarding/drafts — list drafts
  {
    method: ["GET"],
    matcher: "/vendor/store-onboarding/drafts",
    middlewares: [
      validateAndTransformQuery(
        VendorGetDraftsParams,
        vendorDraftQueryConfig.list
      ),
    ],
  },
  // POST /vendor/store-onboarding/drafts — start a draft
  {
    method: ["POST"],
    matcher: "/vendor/store-onboarding/drafts",
    middlewares: [validateAndTransformBody(VendorCreateDraft)],
  },
  // GET /vendor/store-onboarding/drafts/:draft_id — resume a draft
  {
    method: ["GET"],
    matcher: "/vendor/store-onboarding/drafts/:draft_id",
    middlewares: [
      validateAndTransformQuery(
        VendorGetDraftParams,
        vendorDraftQueryConfig.retrieve
      ),
    ],
  },
  // POST /vendor/store-onboarding/drafts/:draft_id — save one screen
  {
    method: ["POST"],
    matcher: "/vendor/store-onboarding/drafts/:draft_id",
    middlewares: [validateAndTransformBody(VendorSaveDraftStep)],
  },
  // DELETE /vendor/store-onboarding/drafts/:draft_id — discard a draft
  {
    method: ["DELETE"],
    matcher: "/vendor/store-onboarding/drafts/:draft_id",
    middlewares: [],
  },
  // POST /vendor/store-onboarding/drafts/:draft_id/submit — materialize the store
  {
    method: ["POST"],
    matcher: "/vendor/store-onboarding/drafts/:draft_id/submit",
    middlewares: [validateAndTransformBody(VendorSubmitDraft)],
  },
]
