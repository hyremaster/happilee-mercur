export const storeOrderGroupFields = [
  "id",
  "customer_id",
  "seller_count",
  "total",
  "created_at",
  "updated_at",

  // Per-seller child orders.
  "orders",
  "orders.id",
  "orders.display_id",
  "orders.status",
  "orders.currency_code",
  "orders.email",
  "orders.created_at",

  // Order money fields (amounts).
  "orders.total",
  "orders.subtotal",
  "orders.item_total",
  "orders.tax_total",
  "orders.shipping_total",
  "orders.discount_total",

  // Seller of the child order.
  "orders.seller_id",
  "orders.seller.id",
  "orders.seller.name",

  // Line items — product name + amounts. NOTE: `quantity` is not a direct
  // scalar on the line item (it lives on the order-item detail), so request it
  // via `detail.quantity`. Per-line amount = unit_price * quantity (there is no
  // line-item `total` field); order-level totals are on the order below.
  "orders.items",
  "orders.items.id",
  "orders.items.title",
  "orders.items.subtitle",
  "orders.items.thumbnail",
  "orders.items.product_id",
  "orders.items.product_title",
  "orders.items.variant_id",
  "orders.items.variant_title",
  "orders.items.variant_sku",
  "orders.items.unit_price",
  "orders.items.detail.quantity",
  "orders.items.detail.unit_price",
  "orders.items.detail.fulfilled_quantity",

  // Per-line tax + discount (relations; empty when none apply).
  "orders.items.tax_lines.rate",
  "orders.items.tax_lines.total",
  "orders.items.tax_lines.code",
  "orders.items.tax_lines.description",
  "orders.items.adjustments.amount",
  "orders.items.adjustments.code",

  // Kept for backwards compatibility (seller via product relation).
  "orders.items.variant",
  "orders.items.variant.product",
  "orders.items.variant.product.seller",
  "orders.items.variant.product.seller.id",
  "orders.items.variant.product.seller.name",
]

export const storeOrderGroupQueryConfig = {
  list: {
    defaults: storeOrderGroupFields,
    allowed: storeOrderGroupFields,
    isList: true,
  },
  retrieve: {
    defaults: storeOrderGroupFields,
    allowed: storeOrderGroupFields,
    isList: false,
  },
}
