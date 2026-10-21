import { validateAndTransformBody } from "@medusajs/framework"
import { PolicyOperation } from "@medusajs/framework/utils"
import { MiddlewareRoute } from "@medusajs/medusa"

import { VendorSaveIntegration, VendorTestIntegration } from "./validators"

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
]
