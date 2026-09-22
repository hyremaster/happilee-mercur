export const vendorStorefrontTemplateFields = [
  "id",
  "name",
  "key",
  "description",
  "preview_image_url",
  "is_active",
  "rank",
  "created_at",
  "updated_at",
]

export const vendorStorefrontTemplateQueryConfig = {
  list: {
    defaults: vendorStorefrontTemplateFields,
    defaultLimit: 50,
    isList: true,
  },
}
