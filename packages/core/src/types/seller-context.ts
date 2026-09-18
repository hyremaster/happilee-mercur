import { SellerMemberDTO } from "@mercurjs/types"

export interface SellerContext {
  seller_id: string
  currency_code: string
  seller_member: SellerMemberDTO
}

declare module "express" {
  interface Request {
    seller_context?: SellerContext
  }
}

/**
 * Store a /store/* request is scoped to, resolved from the `x-seller-handle` /
 * `x-seller-id` header by `attachStoreSellerContext`. Kept separate from
 * {@link SellerContext}: a shopper request has no seller member behind it.
 */
export interface StoreSellerContext {
  seller_id: string
  handle: string
  currency_code: string
}

declare module "express" {
  interface Request {
    store_seller_context?: StoreSellerContext
  }
}
