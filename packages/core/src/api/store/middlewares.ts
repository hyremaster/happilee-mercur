import { MiddlewareRoute } from "@medusajs/medusa"

import { attachStoreSellerContext } from "../utils/store-seller-context-middleware"
import { enforceStoreSessionScope } from "../utils/store-session-scope-middleware"
import { storeAuthMiddlewares } from "./auth/middlewares"
import { storeCartsMiddlewares } from "./carts/middlewares"
import { storeOrderGroupsMiddlewares } from "./order-groups/middlewares"
import { storeProductsMiddlewares } from "./products/middlewares"
import { storeSellersMiddlewares } from "./sellers/middlewares"

export const storeMiddlewares: MiddlewareRoute[] = [
  // Resolve the store this request is for (x-seller-handle / x-seller-id) on the
  // store-scoped surfaces. Runs first so later middlewares and handlers can read
  // req.store_seller_context. See docs/store-scoped-customers.md.
  {
    matcher: "/store/auth/*",
    middlewares: [attachStoreSellerContext],
  },
  {
    matcher: "/store/carts*",
    middlewares: [attachStoreSellerContext, enforceStoreSessionScope],
  },
  {
    matcher: "/store/customers*",
    middlewares: [attachStoreSellerContext, enforceStoreSessionScope],
  },
  {
    matcher: "/store/orders*",
    middlewares: [attachStoreSellerContext, enforceStoreSessionScope],
  },
  ...storeAuthMiddlewares,
  ...storeCartsMiddlewares,
  ...storeOrderGroupsMiddlewares,
  ...storeProductsMiddlewares,
  ...storeSellersMiddlewares,
]
