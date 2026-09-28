import { describe, expect, test } from "bun:test";

import {
  getOrderStatusDisplayNameError,
  isCommerceTypeValid,
  ORDER_STATUS_DISPLAY_NAME_REQUIRED_MESSAGE,
} from "../commerce-type";
import type { CommerceConfig, OrderStatusConfig } from "../types";

function status(patch: Partial<OrderStatusConfig> = {}): OrderStatusConfig {
  return {
    id: "confirmed",
    label: "Confirmed",
    required: false,
    color: "#16A34A",
    displayName: "Confirmed",
    active: true,
    ...patch,
  };
}

function commerce(patch: Partial<CommerceConfig> = {}): CommerceConfig {
  return {
    commerceType: "local-delivery",
    localFulfillment: ["pickup"],
    ecomFulfillment: [],
    deliveryArea: "",
    deliveryAreaName: "",
    orderStatuses: [
      status({
        id: "order-placed",
        label: "Order Placed",
        required: true,
        displayName: "Order Placed",
      }),
      status(),
    ],
    ...patch,
  };
}

describe("order status display name validation", () => {
  test("requires a display name for enabled statuses", () => {
    expect(
      getOrderStatusDisplayNameError(status({ displayName: "" })),
    ).toBe(ORDER_STATUS_DISPLAY_NAME_REQUIRED_MESSAGE);
    expect(
      getOrderStatusDisplayNameError(status({ displayName: "   " })),
    ).toBe(ORDER_STATUS_DISPLAY_NAME_REQUIRED_MESSAGE);
    expect(
      getOrderStatusDisplayNameError(status({ displayName: "Confirmed" })),
    ).toBeUndefined();
  });

  test("allows empty display names for disabled statuses", () => {
    expect(
      getOrderStatusDisplayNameError(
        status({ active: false, displayName: "" }),
      ),
    ).toBeUndefined();
  });

  test("blocks commerce type continue when an enabled status lacks a display name", () => {
    expect(isCommerceTypeValid(commerce())).toBe(true);
    expect(
      isCommerceTypeValid(
        commerce({
          orderStatuses: [
            status({
              id: "order-placed",
              label: "Order Placed",
              required: true,
              displayName: "Order Placed",
            }),
            status({ displayName: "" }),
          ],
        }),
      ),
    ).toBe(false);
    expect(
      isCommerceTypeValid(
        commerce({
          orderStatuses: [
            status({
              id: "order-placed",
              label: "Order Placed",
              required: true,
              displayName: "Order Placed",
            }),
            status({ active: false, displayName: "" }),
          ],
        }),
      ),
    ).toBe(true);
  });
});
