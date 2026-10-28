import { validateAndTransformBody } from "@medusajs/framework"
import { PolicyOperation } from "@medusajs/framework/utils"
import { MiddlewareRoute } from "@medusajs/medusa"

import {
  VendorSaveIntegration,
  VendorTestIntegration,
  VendorRunIntegrationSync,
  VendorUpdateIntegrationLocation,
} from "./validators"

const resource = "integration"

// Store-level integrations (Settings → Integrations). The global /vendor/*
// middlewares resolve the active store from `x-seller-id`; the RBAC policies
// below restrict access to roles granted the `integration` policies (store
// administrators).
export const vendorIntegrationsMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/vendor/integrations",
    middlewares: [],
    policies: [{ resource, operation: PolicyOperation.read }],
  },
  {
    method: ["GET"],
    matcher: "/vendor/integrations/:provider_id",
    middlewares: [],
    policies: [{ resource, operation: PolicyOperation.read }],
  },
  {
    method: ["POST"],
    matcher: "/vendor/integrations/:provider_id",
    middlewares: [validateAndTransformBody(VendorSaveIntegration)],
    policies: [{ resource, operation: PolicyOperation.update }],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/integrations/:provider_id",
    middlewares: [],
    policies: [{ resource, operation: PolicyOperation.delete }],
  },
  {
    method: ["POST"],
    matcher: "/vendor/integrations/:provider_id/test",
    middlewares: [validateAndTransformBody(VendorTestIntegration)],
    policies: [{ resource, operation: PolicyOperation.update }],
  },
  {
    method: ["GET"],
    matcher: "/vendor/integrations/:provider_id/locations",
    middlewares: [],
    policies: [{ resource, operation: PolicyOperation.read }],
  },
  {
    method: ["POST"],
    matcher: "/vendor/integrations/:provider_id/sync",
    middlewares: [validateAndTransformBody(VendorRunIntegrationSync)],
    policies: [{ resource, operation: PolicyOperation.update }],
  },
  {
    method: ["POST"],
    matcher: "/vendor/integrations/:provider_id/locations/:location_id",
    middlewares: [validateAndTransformBody(VendorUpdateIntegrationLocation)],
    policies: [{ resource, operation: PolicyOperation.update }],
  },
  {
    method: ["POST"],
    matcher: "/vendor/integrations/:provider_id/locations/:location_id/create-branch",
    middlewares: [],
    policies: [{ resource, operation: PolicyOperation.update }],
  },
  {
    method: ["GET"],
    matcher: "/vendor/integrations/:provider_id/catalog/summary",
    middlewares: [],
    policies: [{ resource, operation: PolicyOperation.read }],
  },
  {
    method: ["GET"],
    matcher: "/vendor/integrations/:provider_id/sync-runs",
    middlewares: [],
    policies: [{ resource, operation: PolicyOperation.read }],
  },
]
