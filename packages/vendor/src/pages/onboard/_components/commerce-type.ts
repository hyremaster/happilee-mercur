import type { CommerceConfig, OrderStatusConfig } from "./types";

export const ORDER_STATUS_DISPLAY_NAME_REQUIRED_MESSAGE =
  "Display name is required for enabled order statuses";

export function getOrderStatusDisplayNameError(
  status: OrderStatusConfig,
): string | undefined {
  if (!status.active) {
    return undefined;
  }

  if (!status.displayName.trim()) {
    return ORDER_STATUS_DISPLAY_NAME_REQUIRED_MESSAGE;
  }

  return undefined;
}

export function isCommerceTypeValid(data: CommerceConfig) {
  if (!data.commerceType) return false;

  const fulfillment =
    data.commerceType === "local-delivery"
      ? data.localFulfillment
      : data.ecomFulfillment;

  if (fulfillment.length === 0) return false;

  const needsArea =
    data.commerceType === "local-delivery"
      ? data.localFulfillment.includes("delivery")
      : data.ecomFulfillment.includes("shipping");

  if (needsArea && !data.deliveryArea) return false;

  if (data.orderStatuses.length === 0) return false;

  const hasInvalidActiveDisplayName = data.orderStatuses.some(
    (status) => getOrderStatusDisplayNameError(status) !== undefined,
  );

  if (hasInvalidActiveDisplayName) return false;

  return true;
}
