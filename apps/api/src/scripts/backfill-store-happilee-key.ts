import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

// Minimal surface of the marketplace-profile module service used here (the
// module's own service type is not part of the package's public exports).
type StoreProfileRow = { id: string; happilee_api_key: string | null }
type IdentityKeyRow = {
  id: string
  project_id: string
  happilee_api_key: string | null
}
type MarketplaceProfileService = {
  listHappileeIdentityKeys(
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ): Promise<IdentityKeyRow[]>
  listStoreProfiles(filters: Record<string, unknown>): Promise<StoreProfileRow[]>
  updateStoreProfiles(data: {
    id: string
    happilee_api_key: string
  }): Promise<unknown>
}

/**
 * Backfill: seed `store_profile.happilee_api_key` for stores submitted from the
 * dashboard wizard before the submit route learned to fall back to the SSO-bound
 * identity key. Without it, /store/carts delivery checks fall back to the env
 * AREASENSE_API_KEY and Area Sense answers 401.
 *
 * The identity key to copy is named explicitly (project ambiguity is real: one
 * vendor identity per Happilee project), and applies to the listed seller
 * handles. Never overwrites an existing key and never logs key material.
 *
 *   bunx medusa exec ./src/scripts/backfill-store-happilee-key.ts <hidkey_id> <handle> [handle...]
 */
export default async function backfill({ container, args }: ExecArgs) {
  const [keyId, ...handles] = args
  if (!keyId?.startsWith("hidkey_") || !handles.length) {
    throw new Error(
      "Usage: backfill-store-happilee-key.ts <hidkey_id> <seller_handle> [more handles]"
    )
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const service = container.resolve<MarketplaceProfileService>(
    MercurModules.MARKETPLACE_PROFILE
  )

  const [identityKey] = await service.listHappileeIdentityKeys(
    { id: keyId },
    { take: 1 }
  )
  if (!identityKey?.happilee_api_key) {
    throw new Error(`Identity key ${keyId} not found or holds no key`)
  }
  console.log(`Using identity key ${keyId} (project ${identityKey.project_id})`)

  const { data: sellers } = await query.graph({
    entity: "seller",
    fields: ["id", "handle"],
    filters: { handle: handles },
  })

  const found = new Set((sellers as { handle: string }[]).map((s) => s.handle))
  for (const handle of handles) {
    if (!found.has(handle)) {
      console.log(`  ${handle}: seller not found, skip`)
    }
  }

  let updated = 0
  let skipped = 0

  for (const seller of sellers as { id: string; handle: string }[]) {
    const [profile] = await service.listStoreProfiles({ seller_id: seller.id })
    if (!profile) {
      console.log(`  ${seller.handle}: no store_profile, skip`)
      skipped++
      continue
    }
    if (profile.happilee_api_key) {
      console.log(`  ${seller.handle}: key already set, skip`)
      skipped++
      continue
    }

    await service.updateStoreProfiles({
      id: profile.id,
      happilee_api_key: identityKey.happilee_api_key,
    })
    console.log(`  ${seller.handle}: key set`)
    updated++
  }

  console.log(`DONE — ${updated} updated, ${skipped} skipped`)
}
