import { MedusaContainer } from "@medusajs/framework/types"

import { repairReservedInventory } from "../utils/repair-reserved-inventory"

/**
 * Corrects reserved quantities left wrong by a rolled-back workflow in any flow,
 * including Medusa's own routes. See repairReservedInventory.
 */
export default async function repairReservedInventoryJob(container: MedusaContainer) {
  await repairReservedInventory(container)
}

export const config = {
  name: "repair-reserved-inventory",
  schedule: "*/5 * * * *",
}
