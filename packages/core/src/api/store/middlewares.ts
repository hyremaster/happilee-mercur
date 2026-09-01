import { MiddlewareRoute } from "@medusajs/medusa"

import { storeAuthMiddlewares } from "./auth/middlewares"
import { storeCartsMiddlewares } from "./carts/middlewares"
import { storeOrderGroupsMiddlewares } from "./order-groups/middlewares"
import { storeProductsMiddlewares } from "./products/middlewares"
import { storeSellersMiddlewares } from "./sellers/middlewares"

export const storeMiddlewares: MiddlewareRoute[] = [
  ...storeAuthMiddlewares,
  ...storeCartsMiddlewares,
  ...storeOrderGroupsMiddlewares,
  ...storeProductsMiddlewares,
  ...storeSellersMiddlewares,
]
