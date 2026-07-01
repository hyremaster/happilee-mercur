import { MiddlewareRoute } from "@medusajs/framework/http"

export const vendorStorefrontTemplatesMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/vendor/storefront-templates",
    middlewares: [],
  },
]
