import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  IRegionModuleService,
  ISalesChannelModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"
import { createSellerUser } from "../../../helpers/create-seller-user"
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - Cart delivery availability (Area Sense)", () => {
      let appContainer: MedusaContainer
      let seller: any
      let sellerHeaders: any
      let storeHeaders: any
      let region: any
      let salesChannel: any
      let product: any
      let marketplaceService: any

      beforeAll(() => {
        appContainer = getContainer()
        process.env.AREASENSE_API_URL = "http://areasense.test"
      })

      afterAll(() => {
        delete process.env.AREASENSE_API_URL
      })

      afterEach(() => {
        jest.restoreAllMocks()
      })

      // Stub the Happilee checkLocation call. `rows` is the response `data`.
      const mockCheckLocation = (rows: unknown[]) =>
        jest.spyOn(global, "fetch").mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ error: false, data: rows }),
        } as Response)

      beforeEach(async () => {
        const r = await createSellerUser(appContainer, {
          email: "ds@test.com",
          name: "Delivery Seller",
        })
        seller = r.seller
        sellerHeaders = r.headers

        const apiKey = await generatePublishableKey(appContainer)
        storeHeaders = generateStoreHeaders({ publishableKey: apiKey })

        const scModule = appContainer.resolve<ISalesChannelModuleService>(
          Modules.SALES_CHANNEL
        )
        salesChannel = await scModule.createSalesChannels({ name: "DS Store" })

        const regModule = appContainer.resolve<IRegionModuleService>(
          Modules.REGION
        )
        region = await regModule.createRegions({
          name: "DS Region",
          currency_code: "usd",
          countries: ["us"],
        })

        const productRes = await api.post(
          `/vendor/products`,
          {
            status: "published",
            title: "DS Product",
            options: [{ title: "Size", values: ["S"] }],
            variants: [
              {
                title: "S",
                sku: "DS-S",
                options: { Size: "S" },
                prices: [{ currency_code: "usd", amount: 2000 }],
                manage_inventory: false,
              },
            ],
            sales_channels: [{ id: salesChannel.id }],
          },
          sellerHeaders
        )
        product = productRes.data.product

        marketplaceService = appContainer.resolve(
          MercurModules.MARKETPLACE_PROFILE
        )
        await marketplaceService.createStoreProfiles({
          seller_id: seller.id,
          happilee_api_key: "seller-key",
        })
      })

      const createCartWithItem = async () => {
        const cartRes = await api.post(
          `/store/carts`,
          {
            region_id: region.id,
            currency_code: "usd",
            sales_channel_id: salesChannel.id,
            shipping_address: {
              first_name: "Jane",
              last_name: "Doe",
              address_1: "1 St",
              city: "NY",
              province: "NY",
              postal_code: "560001",
              country_code: "us",
              metadata: { latitude: 12.9716, longitude: 77.5946 },
            },
          },
          storeHeaders
        )
        const cartId = cartRes.data.cart.id
        await api.post(
          `/store/carts/${cartId}/line-items`,
          { variant_id: product.variants[0].id, quantity: 1 },
          storeHeaders
        )
        return cartId
      }

      const addArea = () =>
        marketplaceService.createStoreDeliveryAreas([
          { seller_id: seller.id, area_sense_id: "A1", area_name: "Area 1" },
        ])

      it("deliverable when Area Sense reports the seller area serves the location", async () => {
        await addArea()
        const cartId = await createCartWithItem()
        const spy = mockCheckLocation([
          { area_id: "A1", error: false, is_deliverable: true },
        ])

        const res = await api.get(
          `/store/carts/${cartId}/delivery-availability`,
          storeHeaders
        )

        expect(res.status).toEqual(200)
        expect(res.data.deliverable).toBe(true)
        expect(res.data.sellers[0].matched_area_ids).toContain("A1")
        expect(res.data.location).toEqual(
          expect.objectContaining({ latitude: 12.9716, longitude: 77.5946 })
        )
        expect(spy).toHaveBeenCalled()
      })

      it("sends BOTH coordinates and zipcode to Area Sense so either area type matches", async () => {
        await addArea()
        const cartId = await createCartWithItem()
        const spy = mockCheckLocation([
          { area_id: "A1", error: false, is_deliverable: true },
        ])

        await api.get(
          `/store/carts/${cartId}/delivery-availability`,
          storeHeaders
        )

        const checkCall = spy.mock.calls.find(([url]) =>
          String(url).includes("/checkLocation")
        )
        expect(checkCall).toBeDefined()
        const body = JSON.parse((checkCall![1] as { body: string }).body)
        expect(body.areas[0]).toEqual(
          expect.objectContaining({
            area_id: "A1",
            latitude: 12.9716,
            longitude: 77.5946,
            zipcode: "560001",
          })
        )
      })

      it("not deliverable when no area matches", async () => {
        await addArea()
        const cartId = await createCartWithItem()
        mockCheckLocation([{ area_id: "A1", error: false, is_deliverable: false }])

        const res = await api.get(
          `/store/carts/${cartId}/delivery-availability`,
          storeHeaders
        )

        expect(res.data.deliverable).toBe(false)
        expect(res.data.sellers[0].deliverable).toBe(false)
        expect(res.data.reason).toBe("Delivery is not available at this location.")
      })

      it("not deliverable when seller has no delivery areas (no API call)", async () => {
        const cartId = await createCartWithItem()
        const spy = mockCheckLocation([])

        const res = await api.get(
          `/store/carts/${cartId}/delivery-availability`,
          storeHeaders
        )

        expect(res.data.deliverable).toBe(false)
        expect(res.data.sellers[0].reason).toMatch(/no configured delivery areas/i)
        expect(spy).not.toHaveBeenCalled()
      })

      it("reports the seller as not deliverable when Area Sense rejects its key", async () => {
        await addArea()
        const cartId = await createCartWithItem()
        jest.spyOn(global, "fetch").mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({}),
        } as Response)

        const res = await api.get(
          `/store/carts/${cartId}/delivery-availability`,
          storeHeaders
        )

        // The call fails for this seller, but the request still answers.
        expect(res.status).toEqual(200)
        expect(res.data.deliverable).toBe(false)
        expect(res.data.sellers).toHaveLength(1)
        expect(res.data.sellers[0].seller_id).toBe(seller.id)
        expect(res.data.sellers[0].deliverable).toBe(false)
        expect(res.data.sellers[0].matched_area_ids).toEqual([])
        expect(res.data.sellers[0].reason).toMatch(/401/)
      })

      it("keeps checking the other sellers when one seller's Area Sense call fails", async () => {
        await addArea()

        // A second seller with its own area; its Area Sense call succeeds.
        const other = await createSellerUser(appContainer, {
          email: "ds2@test.com",
          name: "Other Seller",
        })
        await marketplaceService.createStoreProfiles({
          seller_id: other.seller.id,
          happilee_api_key: "other-key",
        })
        await marketplaceService.createStoreDeliveryAreas([
          { seller_id: other.seller.id, area_sense_id: "B1", area_name: "Area B" },
        ])
        const otherProductRes = await api.post(
          `/vendor/products`,
          {
            status: "published",
            title: "Other Product",
            options: [{ title: "Size", values: ["S"] }],
            variants: [
              {
                title: "S",
                sku: "OTHER-S",
                options: { Size: "S" },
                prices: [{ currency_code: "usd", amount: 3000 }],
                manage_inventory: false,
              },
            ],
            sales_channels: [{ id: salesChannel.id }],
          },
          other.headers
        )

        const cartId = await createCartWithItem()
        // Fail only the first seller's key; answer the second one normally.
        jest.spyOn(global, "fetch").mockImplementation((async (
          _url: string,
          init?: { headers?: Record<string, string> }
        ) => {
          if (init?.headers?.["x-api-key"] === "seller-key") {
            return { ok: false, status: 401, json: async () => ({}) } as Response
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              error: false,
              data: [{ area_id: "B1", error: false, is_deliverable: true }],
            }),
          } as Response
        }) as unknown as typeof fetch)

        await api.post(
          `/store/carts/${cartId}/line-items`,
          { variant_id: otherProductRes.data.product.variants[0].id, quantity: 1 },
          storeHeaders
        )

        const res = await api.get(
          `/store/carts/${cartId}/delivery-availability`,
          storeHeaders
        )

        expect(res.status).toEqual(200)
        expect(res.data.sellers).toHaveLength(2)
        const failed = res.data.sellers.find(
          (s: { seller_id: string }) => s.seller_id === seller.id
        )
        const ok = res.data.sellers.find(
          (s: { seller_id: string }) => s.seller_id === other.seller.id
        )
        expect(failed.deliverable).toBe(false)
        expect(failed.reason).toMatch(/401/)
        // The healthy seller was still checked and matched its area.
        expect(ok.deliverable).toBe(true)
        expect(ok.matched_area_ids).toContain("B1")
      })

      it("blocks cart completion when the location is not deliverable", async () => {
        await addArea()
        const cartId = await createCartWithItem()
        mockCheckLocation([{ area_id: "A1", error: false, is_deliverable: false }])

        const res = await api
          .post(`/store/carts/${cartId}/complete`, {}, storeHeaders)
          .catch((e) => e.response)

        expect(res.status).toBeGreaterThanOrEqual(400)
        expect(res.data.message).toMatch(/deliver/i)
      })
    })
  },
})
