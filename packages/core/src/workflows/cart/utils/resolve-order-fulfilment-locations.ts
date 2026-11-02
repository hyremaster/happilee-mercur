type ShippingOption = {
  id: string
  service_zone?: {
    fulfillment_set?: { location?: { id?: string | null } | null } | null
  } | null
}

export type ResolveOrderFulfilmentLocationsInput = {
  shippingOptions: ShippingOption[]
  /** Orders as built for creation: they carry the chosen shipping option. */
  ordersToCreate: {
    id: string
    shipping_methods?: { shipping_option_id?: string | null }[] | null
  }[]
  /** Created orders: they carry the order line item ids reservations use. */
  createdOrders: {
    id: string
    items?: { id: string }[] | null
  }[]
}

export type OrderFulfilmentLocations = {
  /** Order line item id → location to reserve its stock at. */
  by_item: Record<string, string>
  /** Order id → the location fulfilling the order. */
  by_order: Record<string, string>
}

/**
 * Where each order is fulfilled from: the location of its chosen shipping
 * option. A store has one shipping method per cart (adding one replaces the
 * previous), so an order has one location. Orders whose option has no location
 * are left out, so their reservation falls back to any location in the sales
 * channel.
 */
export const resolveOrderFulfilmentLocations = ({
  shippingOptions,
  ordersToCreate,
  createdOrders,
}: ResolveOrderFulfilmentLocationsInput): OrderFulfilmentLocations => {
  const locationByOption = new Map(
    shippingOptions.map((option) => [
      option.id,
      option.service_zone?.fulfillment_set?.location?.id,
    ])
  )
  const methodsByOrder = new Map(
    ordersToCreate.map((order) => [order.id, order.shipping_methods ?? []])
  )

  const by_item: Record<string, string> = {}
  const by_order: Record<string, string> = {}

  for (const order of createdOrders) {
    const locationId = (methodsByOrder.get(order.id) ?? [])
      .map((method) => locationByOption.get(method.shipping_option_id ?? ""))
      .find(Boolean)

    if (!locationId) {
      continue
    }
    by_order[order.id] = locationId
    for (const item of order.items ?? []) {
      by_item[item.id] = locationId
    }
  }

  return { by_item, by_order }
}
