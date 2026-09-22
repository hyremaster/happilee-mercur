import {
  addToCartWorkflow,
  createCartWorkflow,
  updateLineItemInCartWorkflow,
} from "@medusajs/medusa/core-flows"

import { assertVariantsAvailable } from "../variant-availability/steps/validate-variants-available"

type ItemInput = { variant_id?: string | null }

// Block vendor-marked unavailable variants from entering a cart. Completion is
// guarded separately in the store cart complete route, which covers items that
// became unavailable after they were added.

createCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const items = ((input as { items?: ItemInput[] }).items ?? []) as ItemInput[]
  await assertVariantsAvailable(
    container,
    items.map((i) => i.variant_id)
  )
})

addToCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const items = ((input as { items?: ItemInput[] }).items ?? []) as ItemInput[]
  await assertVariantsAvailable(
    container,
    items.map((i) => i.variant_id)
  )
})

updateLineItemInCartWorkflow.hooks.validate(
  async ({ input, cart }, { container }) => {
    const { item_id, update } = input as {
      item_id: string
      update?: { quantity?: number | string }
    }
    const item = (
      (cart as {
        items?: { id: string; variant_id?: string | null; quantity: number | string }[]
      }).items ?? []
    ).find((i) => i.id === item_id)

    // Lowering the quantity of an unavailable item is always allowed; only
    // adding more of it is blocked.
    if (
      !item ||
      update?.quantity === undefined ||
      Number(update.quantity) <= Number(item.quantity)
    ) {
      return
    }

    await assertVariantsAvailable(container, [item.variant_id])
  }
)
