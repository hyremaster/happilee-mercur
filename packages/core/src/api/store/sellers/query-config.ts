const storeSellerFields = [
  "id",
  "name",
  "handle",
  "description",
  "logo",
  "banner",
  "is_premium",
  "metadata",
  // Basic store details captured during vendor onboarding.
  // Excludes email + currency_code (owner PII), payment_details
  // (sensitive financial PII), and fulfillment/location entities.
  "phone",
  "website_url",
  "created_at",
  "address.*",
  "professional_details.*",
]

export const listSellerQueryConfig = {
  defaults: storeSellerFields,
  defaultLimit: 50,
  isList: true,
}

export const retrieveSellerQueryConfig = {
  defaults: storeSellerFields,
}
