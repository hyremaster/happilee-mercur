// Fields read off the seller_member graph for the list endpoint. The store's
// own extension data (store_profile, order_statuses, payment_config) and the
// owner @handle (member_profile) are attached in the app layer, because they
// live in a separate module referenced by plain id (no defineLink).
export const vendorStoreListFields = [
  "id",
  "is_owner",
  "seller_id",
  "seller.id",
  "seller.name",
  "seller.handle",
  "seller.email",
  "seller.phone",
  "seller.status",
  "seller.created_at",
  "seller.updated_at",
]

export const vendorStoreRetrieveFields = [
  "id",
  "name",
  "handle",
  "email",
  "phone",
  "description",
  "currency_code",
  "status",
  "*address",
  "*professional_details",
  "created_at",
  "updated_at",
]

export const vendorStoreQueryConfig = {
  list: {
    defaults: vendorStoreListFields,
    defaultLimit: 50,
    isList: true,
  },
  retrieve: {
    defaults: vendorStoreRetrieveFields,
    isList: false,
  },
}

// Fulfillment centre (StockLocation) fields; store_location_detail (is_active,
// lat/lng) is merged in the app layer.
export const vendorStoreLocationFields = [
  "id",
  "name",
  "metadata",
  "created_at",
  "updated_at",
  "address.id",
  "address.address_1",
  "address.address_2",
  "address.company",
  "address.city",
  "address.country_code",
  "address.province",
  "address.postal_code",
  "address.phone",
]

export const vendorStoreLocationQueryConfig = {
  list: {
    defaults: vendorStoreLocationFields,
    defaultLimit: 50,
    isList: true,
  },
  retrieve: {
    defaults: vendorStoreLocationFields,
    isList: false,
  },
}

export const vendorDraftFields = [
  "id",
  "member_id",
  "draft_data",
  "onboarding_step",
  "status",
  "submitted_seller_id",
  "created_at",
  "updated_at",
]

export const vendorDraftQueryConfig = {
  list: {
    defaults: vendorDraftFields,
    defaultLimit: 50,
    isList: true,
  },
  retrieve: {
    defaults: vendorDraftFields,
    isList: false,
  },
}
