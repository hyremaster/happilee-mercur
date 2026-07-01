import { model } from "@medusajs/framework/utils"

/**
 * Extension table for a Mercur Member (store owner / account).
 *
 * Holds the public `@handle` username shown in the Stores listing. One owner can
 * own many stores, so the handle lives on the member, not the store. `member_id`
 * is a plain text reference to the core Member id (no defineLink, no
 * cross-module DB FK).
 */
const MemberProfile = model
  .define("MemberProfile", {
    id: model.id({ prefix: "memprof" }).primaryKey(),
    member_id: model.text(),
    handle: model.text().searchable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_member_profile_member_id_unique",
      on: ["member_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_member_profile_handle_unique",
      on: ["handle"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default MemberProfile
