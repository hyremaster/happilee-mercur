import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";

import {
  getStoreSwitchTargetPath,
  resetQueriesAfterStoreSwitch,
} from "../store-switch";

describe("getStoreSwitchTargetPath", () => {
  test("keeps the section root for list pages", () => {
    expect(getStoreSwitchTargetPath("/products")).toBe("/products");
    expect(getStoreSwitchTargetPath("/orders")).toBe("/orders");
    expect(getStoreSwitchTargetPath("/inventory")).toBe("/inventory");
  });

  test("drops nested detail segments from the previous store", () => {
    expect(getStoreSwitchTargetPath("/products/prod_123")).toBe("/products");
    expect(getStoreSwitchTargetPath("/orders/ord_123/fulfillments")).toBe(
      "/orders",
    );
    expect(getStoreSwitchTargetPath("/inventory/item_123")).toBe("/inventory");
  });

  test("collapses nested settings paths to /settings", () => {
    expect(getStoreSwitchTargetPath("/settings/locations/loc_1")).toBe(
      "/settings",
    );
  });

  test("returns / for the app root", () => {
    expect(getStoreSwitchTargetPath("/")).toBe("/");
  });
});

describe("resetQueriesAfterStoreSwitch", () => {
  test("clears cached queries immediately without leaving stale store data", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["products"], { products: [{ id: "p1" }] });
    queryClient.setQueryData(["orders"], { orders: [{ id: "o1" }] });
    queryClient.setQueryData(["me"], { seller_member: { seller: { id: "s1" } } });

    resetQueriesAfterStoreSwitch(queryClient);

    expect(queryClient.getQueryData(["products"])).toBeUndefined();
    expect(queryClient.getQueryData(["orders"])).toBeUndefined();
    expect(queryClient.getQueryData(["me"])).toBeUndefined();
  });
});
