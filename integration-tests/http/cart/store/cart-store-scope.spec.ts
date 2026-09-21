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
 * Phase 4 of store-scoped customers (docs/store-scoped-customers.md): a cart
 * belongs to exactly one store. Adding another store's product is refused
 * rather than silently split at checkout.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - carts are scoped to one store", () => {
      let appContainer: MedusaContainer
      let storeA: any
      let storeB: any
      let productA: any
      let productB: any
      let storeHeaders: { headers: Record<string, string> }
      let region: any
      let salesChannel: any

      const openStore = async (email: string, name: string) => {
        const created = await createSellerUser(appContainer, { email, name })
        const sellerService = appContainer.resolve(MercurModules.SELLER) as {
          updateSellers(data: { id: string; status: string }): Promise<unknown>
        }
        await sellerService.updateSellers({
          id: created.seller.id,
          status: SellerStatus.OPEN,
        })
        return created
      }

      const createProduct = async (
        sellerHeaders: Record<string, unknown>,
        title: string,
        sku: string
      ) => {
        const res = await api.post(
          `/vendor/products`,
          {
            status: "published",
            title,
            options: [{ title: "Size", values: ["S"] }],
            variants: [
              {
                title: "S",
                sku,
                options: { Size: "S" },
                prices: [{ currency_code: "usd", amount: 2000 }],
                manage_inventory: false,
              },
            ],
            sales_channels: [{ id: salesChannel.id }],
          },
          sellerHeaders
        )
        return res.data.product
      }

      beforeAll(() => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        const a = await openStore("cart-a@test.com", "Cart Store A")
        const b = await openStore("cart-b@test.com", "Cart Store B")
        storeA = a.seller
        storeB = b.seller

        const apiKey = await generatePublishableKey(appContainer)
        storeHeaders = generateStoreHeaders({ publishableKey: apiKey })

        const scModule = appContainer.resolve<ISalesChannelModuleService>(
          Modules.SALES_CHANNEL
        )
        salesChannel = await scModule.createSalesChannels({ name: "Scope SC" })

        const regModule = appContainer.resolve<IRegionModuleService>(
          Modules.REGION
        )
        region = await regModule.createRegions({
          name: "Scope Region",
          currency_code: "usd",
          countries: ["us"],
        })

        productA = await createProduct(a.headers, "Product A", "SCOPE-A")
        productB = await createProduct(b.headers, "Product B", "SCOPE-B")
      })

      const atStore = (seller?: { handle: string }) => ({
        headers: {
          ...storeHeaders.headers,
          ...(seller ? { "x-seller-handle": seller.handle } : {}),
        },
      })

      const createCart = async (seller?: { handle: string }) => {
        const res = await api.post(
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
          atStore(seller)
        )
        return res.data.cart
      }

      const addItem = (
        cartId: string,
        product: any,
        seller?: { handle: string }
      ) =>
        api.post(
          `/store/carts/${cartId}/line-items`,
          { variant_id: product.variants[0].id, quantity: 1 },
          atStore(seller)
        )

      it("records the store on a cart created with a store header", async () => {
        const cart = await createCart(storeA)

        expect(cart.metadata?.seller_id).toBe(storeA.id)
      })

      it("accepts items from the cart's own store", async () => {
        const cart = await createCart(storeA)

        const res = await addItem(cart.id, productA, storeA)

        expect(res.status).toEqual(200)
        expect(res.data.cart.items).toHaveLength(1)
      })

      it("refuses an item from another store", async () => {
        const cart = await createCart(storeA)

        const res = await addItem(cart.id, productB, storeA).catch(
          (e) => e.response
        )

        expect(res.status).toEqual(400)
        expect(res.data.message).toMatch(/another store|different store/i)
      })

      it("refuses a second store's item on a cart that names no store", async () => {
        // Legacy cart (no header at create): the store is taken from what is
        // already in it.
        const cart = await createCart()
        await addItem(cart.id, productA)

        const res = await addItem(cart.id, productB).catch((e) => e.response)

        expect(res.status).toEqual(400)
        expect(res.data.message).toMatch(/another store|different store/i)
      })

      it("still allows a plain single-store cart with no header at all", async () => {
        const cart = await createCart()

        const first = await addItem(cart.id, productA)
        const second = await addItem(cart.id, productA)

        expect(first.status).toEqual(200)
        expect(second.status).toEqual(200)
      })
    })
  },
})
