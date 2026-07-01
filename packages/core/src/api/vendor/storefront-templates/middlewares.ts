import { authenticate } from "@medusajs/framework"
import { MiddlewareRoute } from "@medusajs/framework/http"

export const vendorStorefrontTemplatesMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/vendor/storefront-templates",
    middlewares: [
      authenticate("member", ["session", "bearer"], { allowUnregistered: false }),
    ],
  },
]
