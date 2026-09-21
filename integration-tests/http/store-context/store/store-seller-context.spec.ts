import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  IRegionModuleService,
  ISalesChannelModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { MercurModules, SellerStatus } from "@mercurjs/types"

import { createSellerUser } from "../../../helpers/create-seller-user"
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"

jest.setTimeout(120000)

/**
 * Phase 1 of store-scoped customers (docs/store-scoped-customers.md): the store
 * API learns which store a request is for, from the `x-seller-handle` header.
 * Resolution only — nothing is enforced yet, so a request without the header
 * still works while the storefront is being updated.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - seller context header", () => {
      let appContainer: MedusaContainer
      let seller: any
      let storeHeaders: any
      let region: any
      let salesChannel: any

      beforeAll(() => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        const created = await createSellerUser(appContainer, {
          email: "ctx@test.com",
          name: "Context Store",
        })
        seller = created.seller

        // A store only serves shoppers once it is open (onboarding submits as
        // open; the test helper creates it pending_approval).
        await sellerService().updateSellers({
          id: seller.id,
          status: SellerStatus.OPEN,
        })

        const apiKey = await generatePublishableKey(appContainer)
        storeHeaders = generateStoreHeaders({ publishableKey: apiKey })

        const scModule = appContainer.resolve<ISalesChannelModuleService>(
          Modules.SALES_CHANNEL
        )
        salesChannel = await scModule.createSalesChannels({ name: "Ctx Store" })

        const regModule = appContainer.resolve<IRegionModuleService>(
          Modules.REGION
        )
        region = await regModule.createRegions({
          name: "Ctx Region",
          currency_code: "usd",
          countries: ["us"],
        })
      })

      const sellerService = () =>
        appContainer.resolve(MercurModules.SELLER) as {
          updateSellers(data: { id: string; status: string }): Promise<unknown>
        }

      const cartBody = () => ({
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
      })

      const withHeader = (value: string, name = "x-seller-handle") => ({
        headers: { ...storeHeaders.headers, [name]: value },
      })

      it("accepts a request carrying a known store handle", async () => {
        const res = await api.post(
          `/store/carts`,
          cartBody(),
          withHeader(seller.handle)
        )

        expect(res.status).toEqual(200)
      })

      it("accepts the store id header as well as the handle", async () => {
        const res = await api.post(
          `/store/carts`,
          cartBody(),
          withHeader(seller.id, "x-seller-id")
        )

        expect(res.status).toEqual(200)
      })

      it("rejects an unknown store handle", async () => {
        const res = await api
          .post(`/store/carts`, cartBody(), withHeader("no-such-store"))
          .catch((e) => e.response)

        expect(res.status).toEqual(400)
        expect(res.data.message).toMatch(/store/i)
      })

      it("rejects a store that is not open", async () => {
        await sellerService().updateSellers({
          id: seller.id,
          status: SellerStatus.SUSPENDED,
        })

        const res = await api
          .post(`/store/carts`, cartBody(), withHeader(seller.handle))
          .catch((e) => e.response)

        expect(res.status).toEqual(400)
        expect(res.data.message).toMatch(/not accepting orders|not open/i)
      })

      it("still works without the header while the storefront is updated", async () => {
        const res = await api.post(`/store/carts`, cartBody(), storeHeaders)

        expect(res.status).toEqual(200)
      })
    })
  },
})
