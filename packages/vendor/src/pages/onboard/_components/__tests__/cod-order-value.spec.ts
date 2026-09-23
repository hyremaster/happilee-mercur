import { describe, expect, test } from "bun:test";

import {
  getCodMaxError,
  getCodMinError,
  isFulfillmentValid,
} from "../steps/fulfillment-details-step";
import type { FulfillmentCentre, PaymentConfig } from "../types";

const centre: FulfillmentCentre = {
  id: "loc_1",
  name: "Main outlet",
  address: "123 Street",
  city: "Bengaluru",
  state: "Karnataka",
  country: "India",
  pinCode: "560001",
  active: true,
};

function payment(patch: Partial<PaymentConfig> = {}): PaymentConfig {
  return {
    methods: ["cod"],
    onlinePaymentMethods: [],
    codMin: "",
    codMax: "",
    ...patch,
  };
}

describe("COD order value fields", () => {
  test("requires min and max when Cash on Delivery is selected", () => {
    expect(isFulfillmentValid([centre], payment())).toBe(false);
    expect(isFulfillmentValid([centre], payment({ codMin: "100" }))).toBe(
      false,
    );
    expect(isFulfillmentValid([centre], payment({ codMax: "500" }))).toBe(
      false,
    );
    expect(
      isFulfillmentValid(
        [centre],
        payment({ codMin: "100", codMax: "500" }),
      ),
    ).toBe(true);
  });

  test("rejects invalid or inconsistent amounts", () => {
    expect(getCodMinError(payment({ codMin: "0" }))).toBe(
      "Enter a positive number",
    );
    expect(getCodMaxError(payment({ codMax: "-5" }))).toBe(
      "Enter a positive number",
    );
    expect(
      getCodMaxError(payment({ codMin: "100", codMax: "50" })),
    ).toBe("Maximum must be greater than minimum");
    expect(
      isFulfillmentValid(
        [centre],
        payment({ codMin: "100", codMax: "50" }),
      ),
    ).toBe(false);
  });
});
