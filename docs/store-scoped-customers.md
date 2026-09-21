# Store-scoped customers

Status: design agreed, not implemented.
Date: 2026-09-18.

## Goal

A shopper's account belongs to one store, not to the marketplace. The same phone
number signs in separately at each store, each store keeps its own cart and order
history, and a session minted at one store is rejected by another.

## Decisions taken

1. Store context travels in a request header (`x-seller-handle`). Per-store
   publishable keys / sales channels are a possible later step, not this one.
2. Existing global customers and their orders are left untouched. Store accounts
   start fresh; old orders keep pointing at the old global customer.
3. Adding a line item from another store is rejected (400), rather than silently
   starting a second cart.

## Current behaviour (what we are changing)

- `mintPhoneCustomerSession` (`packages/core/src/api/store/auth/shared/mint-customer-session.ts`)
  keys the auth identity on `provider` + phone and deliberately unifies both
  phone channels onto one `Customer`. No seller dimension anywhere.
- The `seller_customer` link (`packages/core/src/links/seller-customer-link.ts`)
  exists, but is only written at order completion
  (`workflows/cart/workflows/complete-cart-with-split-orders.ts`). A shopper who
  signs in but never orders belongs to no store.
- `/store/*` has no store context; only `/vendor/*` does, via
  `ensureSellerMiddleware` and the `x-seller-id` header
  (`packages/core/src/api/utils/ensure-seller-middleware.ts`).
- Carts may hold items from several stores; order splitting produces one child
  order per store.

## Target model

Identity is `(phone, store)`:

| Concern | Today | Target |
| --- | --- | --- |
| Auth identity | `provider` + phone | `provider` + `"<phone>:<seller_id>"` |
| Customer row | one per phone | one per phone per store |
| Synthesized email | `<digits>@<domain>` | `<digits>.<handle>@<domain>` |
| `seller_customer` link | written at first order | written at first sign-in |
| Session | valid marketplace-wide | carries `seller_id`, rejected elsewhere |
| Cart | may span stores | exactly one store |

## Implementation

### Phase 1 — store context on `/store/*`

New `packages/core/src/api/utils/store-seller-context-middleware.ts`, modelled on
`ensureSellerMiddleware`:

- reads `x-seller-handle` (also accept `x-seller-id`), resolves the seller,
  rejects unknown or non-open stores;
- sets `req.seller_context = { seller_id }`;
- mounted from `api/store/middlewares.ts` on the routes that need it: `/store/auth/*`,
  `/store/carts`, `/store/carts/:id*`, `/store/customers*`, `/store/orders*`.

Deliberately not required on public catalogue routes (`/store/products`,
`/store/sellers/*`), which already take the store in the path or are marketplace-wide.

### Phase 2 — per-store accounts

In `mint-customer-session.ts`:

- take `seller_id` as an input; look up the identity by composite `entity_id`;
- scope the "reuse an existing customer" query to that store (by the
  `seller_customer` link), so WhatsApp and Firebase still unify **within** a
  store but never across stores;
- synthesize the email with the store handle;
- set `customer.metadata.seller_id`, and create the `seller_customer` link right
  here;
- mint the JWT with `app_metadata.seller_id` alongside `customer_id`.

Callers to update: `api/store/auth/firebase/verify/route.ts`,
`api/store/auth/phone/verify-otp/route.ts`, `send-otp`, and
`api/store/auth/phone/exists/route.ts` (must answer per store, or the storefront
shows "returning user" to someone new to that store).

### Phase 3 — session isolation

Guard on authenticated `/store/*`: compare `req.auth_context.app_metadata.seller_id`
with `req.seller_context.seller_id`; on mismatch return 401
("this session belongs to another store"). Without this the token stays valid
everywhere, since it is a structurally valid customer token.

Tokens minted before this change carry no `seller_id`. Treat a missing claim as
invalid for store-scoped routes (forces one re-login) — simpler than a grace
period, and the storefront's login flow is cheap.

### Phase 4 — store-scoped carts

- `POST /store/carts` requires store context and records the store on the cart
  (`metadata.seller_id`), and uses that store's customer.
- Middleware on `POST /store/carts/:id/line-items` (Medusa's own route, not
  overridden in core): resolve the variant's seller, reject with 400 when it
  differs from the cart's store.
- `checkCartDeliveryAvailability` simplifies to a single store, though the
  existing loop stays correct as-is.
- Order splitting and order groups are unchanged; they will simply always
  produce one child order.

### Phase 5 — storefront (`happilee-ecom-storefront`)

- send `x-seller-handle` on every `/store/*` call;
- store the session token per store (key by handle), never one shared token;
- treat "signed in at store A" as signed out at store B;
- keep one active cart per store.

## Tests

| Spec | Case |
| --- | --- |
| `integration-tests/http/auth/store/phone-auth.spec.ts` | same phone at two stores produces two customers, two tokens |
| same | second sign-in at the same store reuses that store's customer |
| same | WhatsApp and Firebase at one store still unify onto one customer |
| `integration-tests/http/auth/store/session-scope.spec.ts` (new) | store A's token on store B's request → 401 |
| same | token without `seller_id` → 401 on store-scoped routes |
| `integration-tests/http/cart/store/cart-store-scope.spec.ts` (new) | adding another store's variant → 400 |
| same | cart + order history only contain that store's data |
| `integration-tests/http/customer/vendor/customer.spec.ts` | vendor sees a shopper who signed in but never ordered |

## Risks and follow-ups

- A phone number no longer identifies a person across the marketplace. If a
  cross-store feature is ever wanted (one order history, marketplace loyalty), a
  `shopper` entity grouping a phone's store accounts is cheap to add now and
  expensive to retrofit. Not in scope, but worth deciding early.
- Admin's customer list will show one row per phone per store. Vendor lists are
  already link-scoped and stay correct.
- Header-based context is client-supplied. It decides *which* store a session
  belongs to, so the guard must compare it against the token claim rather than
  trust it alone. Moving to per-store publishable keys later makes this stronger.
- Old global customers remain, holding past orders; they will not match any
  store account. Expect duplicates in admin.
