import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ISalesChannelModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createAdminUser, adminHeaders } from "../../../helpers/create-admin-user"
import { createSellerDefaultsWorkflow } from "@mercurjs/core/workflows"

jest.setTimeout(60000)

type ShippingOptionRow = {
  id: string
  name: string
  price_type: string
  type: { code: string } | null
  rules: { attribute: string; value: string }[]
  prices: { amount: number; currency_code: string }[]
  service_zone: { fulfillment_set: { type: string } }
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Store Onboarding - Fulfillment shipping options on submit", () => {
      let appContainer: MedusaContainer
      let token: string
      let email: string

      const headers = () => ({
        headers: { authorization: `Bearer ${token}` },
      })

      beforeAll(async () => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        await createSellerDefaultsWorkflow(appContainer).run()
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        email = `ship-${Date.now()}@test.com`
        const reg = await api.post("/auth/member/emailpass/register", {
          email,
          password: "somepassword",
        })
        token = reg.data.token
      })

      // Drive a full draft (business -> commerce -> fulfillment) and submit.
      const submitStore = async (
        name: string,
        commerce_type: string,
        fulfillment_methods: string[]
      ): Promise<string> => {
        const draftRes = await api.post(
          "/vendor/store-onboarding/drafts",
          {},
          headers()
        )
        const draftId = draftRes.data.draft.id

        await api.post(
          `/vendor/store-onboarding/drafts/${draftId}`,
          {
            step: 1,
            data: {
              name,
              email,
              currency_code: "inr",
              address: { country_code: "us", city: "New York" },
            },
          },
          headers()
        )
        await api.post(
          `/vendor/store-onboarding/drafts/${draftId}`,
          { step: 2, data: { commerce_type, fulfillment_methods } },
          headers()
        )
        await api.post(
          `/vendor/store-onboarding/drafts/${draftId}`,
          {
            step: 3,
            data: {
              locations: [
                {
                  name: `${name} Warehouse`,
                  address: {
                    address_1: "123 Main St",
                    city: "New York",
                    country_code: "us",
                    postal_code: "10001",
                    province: "NY",
                  },
                },
              ],
            },
          },
          headers()
        )

        const submit = await api.post(
          `/vendor/store-onboarding/drafts/${draftId}/submit`,
          {},
          headers()
        )
        return submit.data.seller_id
      }

      const getSellerShippingOptions = async (
        sellerId: string
      ): Promise<ShippingOptionRow[]> => {
        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "seller",
          fields: [
            "id",
            "shipping_options.id",
            "shipping_options.name",
            "shipping_options.price_type",
            "shipping_options.type.code",
            "shipping_options.rules.attribute",
            "shipping_options.rules.value",
            "shipping_options.prices.amount",
            "shipping_options.prices.currency_code",
            "shipping_options.service_zone.fulfillment_set.type",
          ],
          filters: { id: sellerId },
        })
        return (data[0]?.shipping_options ?? []) as ShippingOptionRow[]
      }

      const fulfillmentSetTypes = (options: ShippingOptionRow[]): string[] =>
        options.map((o) => o.service_zone.fulfillment_set.type).sort()

      it("local delivery (delivery + pickup) creates a shipping and a pickup option", async () => {
        const sellerId = await submitStore("Local Store", "local_delivery", [
          "delivery",
          "pickup",
        ])

        const options = await getSellerShippingOptions(sellerId)
        expect(options).toHaveLength(2)
        expect(fulfillmentSetTypes(options)).toEqual(["pickup", "shipping"])

        // Every option is store-visible (enabled_in_store rule), flat + free.
        for (const option of options) {
          expect(option.price_type).toBe("flat")
          expect(
            option.rules.find((r) => r.attribute === "enabled_in_store")?.value
          ).toBe("true")
          expect(option.prices).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ amount: 0, currency_code: "inr" }),
            ])
          )
        }
      })

      it("ecommerce shipping (shipping + pickup) creates a shipping and a pickup option", async () => {
        const sellerId = await submitStore(
          "Ecom Store",
          "ecommerce_shipping",
          ["shipping", "pickup"]
        )

        const options = await getSellerShippingOptions(sellerId)
        expect(options).toHaveLength(2)
        expect(fulfillmentSetTypes(options)).toEqual(["pickup", "shipping"])
      })

      it("delivery only creates a single shipping option (no pickup)", async () => {
        const sellerId = await submitStore("Delivery Only", "local_delivery", [
          "delivery",
        ])

        const options = await getSellerShippingOptions(sellerId)
        expect(options).toHaveLength(1)
        expect(fulfillmentSetTypes(options)).toEqual(["shipping"])
      })

      it("pickup only creates a single pickup option (no shipping)", async () => {
        const sellerId = await submitStore("Pickup Only", "ecommerce_shipping", [
          "pickup",
        ])

        const options = await getSellerShippingOptions(sellerId)
        expect(options).toHaveLength(1)
        expect(fulfillmentSetTypes(options)).toEqual(["pickup"])
        expect(options[0].type?.code).toBe("pickup")
      })

      it("links the store's locations to every enabled sales channel", async () => {
        const salesChannelModule =
          appContainer.resolve<ISalesChannelModuleService>(Modules.SALES_CHANNEL)
        const [enabled] = await salesChannelModule.createSalesChannels([
          { name: "Webshop" },
        ])
        const [disabled] = await salesChannelModule.createSalesChannels([
          { name: "Retired", is_disabled: true },
        ])

        const sellerId = await submitStore("Linked Store", "local_delivery", [
          "delivery",
        ])

        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data: sellerLocations } = await query.graph({
          entity: "stock_location_seller",
          fields: ["stock_location_id"],
          filters: { seller_id: sellerId },
        })
        expect(sellerLocations).toHaveLength(1)

        const { data: links } = await query.graph({
          entity: "sales_channel_location",
          fields: ["sales_channel_id"],
          filters: { stock_location_id: sellerLocations[0].stock_location_id },
        })
        const linkedIds = links.map(
          (l: { sales_channel_id: string }) => l.sales_channel_id
        )
        expect(linkedIds).toContain(enabled.id)
        expect(linkedIds).not.toContain(disabled.id)
      })

      it("no fulfillment methods creates no shipping options", async () => {
        const sellerId = await submitStore("No Methods", "local_delivery", [])

        const options = await getSellerShippingOptions(sellerId)
        expect(options).toHaveLength(0)
      })
    })
  },
})
