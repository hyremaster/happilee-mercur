import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  IInventoryService,
  IRegionModuleService,
  ISalesChannelModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"
import { createSellerUser } from "../../../helpers/create-seller-user"
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"

jest.setTimeout(120000)

type Headers = { headers: Record<string, string> }
type Coords = { latitude: number; longitude: number }
type ListedOption = {
  id: string
  name: string
  service_zone: { fulfillment_set: { type: string; location: { id: string } } }
}

// Trivandrum-area points: the customer is a few km from "Palayam" and ~20 km
// from "Kazhakkoottam".
const PALAYAM: Coords = { latitude: 8.5065, longitude: 76.9537 }
const KAZHAKKOOTTAM: Coords = { latitude: 8.5686, longitude: 76.8731 }
const CUSTOMER_NEAR_PALAYAM: Coords = { latitude: 8.4875, longitude: 76.9525 }

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - Shipping options across store locations", () => {
      let appContainer: MedusaContainer
      let sellerId: string
      let sellerHeaders: Headers
      let storeHeaders: Headers
      let salesChannelId: string
      let regionId: string
      let shippingProfileId: string
      let counter = 0

      beforeAll(() => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        const seller = await createSellerUser(appContainer, {
          email: "nearest@test.com",
          name: "Nearest Store",
        })
        sellerId = seller.seller.id
        sellerHeaders = seller.headers

        storeHeaders = generateStoreHeaders({
          publishableKey: await generatePublishableKey(appContainer),
        })

        const salesChannel = await appContainer
          .resolve<ISalesChannelModuleService>(Modules.SALES_CHANNEL)
          .createSalesChannels({ name: "Nearest Channel" })
        salesChannelId = salesChannel.id

        const region = await appContainer
          .resolve<IRegionModuleService>(Modules.REGION)
          .createRegions({ name: "India", currency_code: "inr", countries: ["in"] })
        regionId = region.id

        const profile = await api.post(
          `/vendor/shipping-profiles`,
          { name: `Profile ${++counter}`, type: "default" },
          sellerHeaders
        )
        shippingProfileId = profile.data.shipping_profile.id
      })

      /** A store location with coordinates and a shipping and/or pickup option. */
      const createLocation = async (
        name: string,
        coords: Coords | null,
        methods: ("shipping" | "pickup")[]
      ) => {
        const suffix = `${name}-${++counter}`
        const location = (
          await api.post(`/vendor/stock-locations`, { name }, sellerHeaders)
        ).data.stock_location

        await api.post(
          `/vendor/stock-locations/${location.id}/fulfillment-providers`,
          { add: ["manual_manual"] },
          sellerHeaders
        )
        await api.post(
          `/vendor/stock-locations/${location.id}/sales-channels`,
          { add: [salesChannelId] },
          sellerHeaders
        )
        if (coords) {
          await appContainer
            .resolve<{
              createStoreLocationDetails(data: {
                stock_location_id: string
                latitude: number
                longitude: number
              }): Promise<unknown>
            }>(MercurModules.MARKETPLACE_PROFILE)
            .createStoreLocationDetails({ stock_location_id: location.id, ...coords })
        }

        const optionIds: Record<string, string> = {}
        for (const type of methods) {
          await api.post(
            `/vendor/stock-locations/${location.id}/fulfillment-sets`,
            { name: `${type} ${suffix}`, type },
            sellerHeaders
          )
          const withSets = await api.get(
            `/vendor/stock-locations/${location.id}?fields=*fulfillment_sets`,
            sellerHeaders
          )
          const set = withSets.data.stock_location.fulfillment_sets.find(
            (s: { type: string }) => s.type === type
          )
          const zone = await api.post(
            `/vendor/fulfillment-sets/${set.id}/service-zones`,
            {
              name: `zone ${type} ${suffix}`,
              geo_zones: [{ type: "country", country_code: "in" }],
            },
            sellerHeaders
          )
          const serviceZone = zone.data.fulfillment_set.service_zones[0]

          const option = await api.post(
            `/vendor/shipping-options`,
            {
              name: type === "pickup" ? "Pickup" : "Standard Shipping",
              service_zone_id: serviceZone.id,
              shipping_profile_id: shippingProfileId,
              provider_id: "manual_manual",
              price_type: "flat",
              type:
                type === "pickup"
                  ? { label: "Pickup", description: "Pickup", code: "pickup" }
                  : { label: "Standard", description: "Standard", code: "standard" },
              prices: [{ currency_code: "inr", amount: 0 }],
              rules: [
                { attribute: "enabled_in_store", value: "true", operator: "eq" },
              ],
            },
            sellerHeaders
          )
          optionIds[type] = option.data.shipping_option.id
        }

        return { id: location.id as string, optionIds }
      }

      const createProduct = async (manageInventory: boolean) => {
        const res = await api.post(
          `/vendor/products`,
          {
            status: "published",
            title: `Biryani ${++counter}`,
            options: [{ title: "Size", values: ["Full"] }],
            variants: [
              {
                title: "Full",
                options: { Size: "Full" },
                prices: [{ currency_code: "inr", amount: 250 }],
                manage_inventory: manageInventory,
              },
            ],
            sales_channels: [{ id: salesChannelId }],
            shipping_profile_id: shippingProfileId,
          },
          sellerHeaders
        )
        return res.data.product.variants[0].id as string
      }

      const shippingOptionsFor = async (variantId: string, at: Coords) => {
        const cart = (
          await api.post(
            `/store/carts`,
            {
              region_id: regionId,
              sales_channel_id: salesChannelId,
              currency_code: "inr",
              shipping_address: {
                first_name: "Test",
                last_name: "Customer",
                address_1: "MG Road",
                city: "Thiruvananthapuram",
                country_code: "in",
                postal_code: "695001",
                metadata: at,
              },
            },
            storeHeaders
          )
        ).data.cart
        await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantId, quantity: 1 },
          storeHeaders
        )
        const res = await api.get(
          `/store/shipping-options?cart_id=${cart.id}`,
          storeHeaders
        )
        return (res.data.shipping_options[sellerId] ?? []) as ListedOption[]
      }

      const standard = (options: ListedOption[]) =>
        options.filter((o) => o.service_zone.fulfillment_set.type === "shipping")

      it("offers Standard Shipping once, from the location nearest the customer", async () => {
        const far = await createLocation("Kazhakkoottam", KAZHAKKOOTTAM, ["shipping"])
        const near = await createLocation("Palayam", PALAYAM, ["shipping"])
        const variantId = await createProduct(false)

        const options = standard(
          await shippingOptionsFor(variantId, CUSTOMER_NEAR_PALAYAM)
        )

        expect(options.map((o) => o.id)).toEqual([near.optionIds.shipping])
        expect(options.map((o) => o.id)).not.toContain(far.optionIds.shipping)
      })

      it("keeps every pickup location", async () => {
        const far = await createLocation("Kazhakkoottam", KAZHAKKOOTTAM, [
          "shipping",
          "pickup",
        ])
        const near = await createLocation("Palayam", PALAYAM, ["shipping", "pickup"])
        const variantId = await createProduct(false)

        const options = await shippingOptionsFor(variantId, CUSTOMER_NEAR_PALAYAM)
        const pickups = options
          .filter((o) => o.service_zone.fulfillment_set.type === "pickup")
          .map((o) => o.id)
          .sort()

        expect(pickups).toEqual([far.optionIds.pickup, near.optionIds.pickup].sort())
        expect(standard(options)).toHaveLength(1)
      })

      it("ships from the nearest location that has the items in stock", async () => {
        const far = await createLocation("Kazhakkoottam", KAZHAKKOOTTAM, ["shipping"])
        await createLocation("Palayam", PALAYAM, ["shipping"])
        const variantId = await createProduct(true)

        // Stock only at the far location.
        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "variant",
          fields: ["inventory_items.inventory_item_id"],
          filters: { id: variantId },
        })
        await appContainer
          .resolve<IInventoryService>(Modules.INVENTORY)
          .createInventoryLevels({
            inventory_item_id: data[0].inventory_items[0].inventory_item_id,
            location_id: far.id,
            stocked_quantity: 5,
          })

        const options = standard(
          await shippingOptionsFor(variantId, CUSTOMER_NEAR_PALAYAM)
        )
        expect(options.map((o) => o.id)).toEqual([far.optionIds.shipping])
      })

      it("still offers one Standard Shipping when locations have no coordinates", async () => {
        await createLocation("Unmapped A", null, ["shipping"])
        await createLocation("Unmapped B", null, ["shipping"])
        const variantId = await createProduct(false)

        const options = standard(
          await shippingOptionsFor(variantId, CUSTOMER_NEAR_PALAYAM)
        )
        expect(options).toHaveLength(1)
      })
    })
  },
})
