import { model } from "@medusajs/framework/utils"

const StorefrontTemplate = model.define("StorefrontTemplate", {
  id: model.id({ prefix: "sftempl" }).primaryKey(),
  name: model.text(),
  key: model.text(),
  description: model.text().nullable(),
  preview_image_url: model.text().nullable(),
  is_active: model.boolean().default(true),
  rank: model.number().default(0),
})

export default StorefrontTemplate
