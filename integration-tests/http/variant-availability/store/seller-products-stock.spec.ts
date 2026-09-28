import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  IInventoryService,
  ISalesChannelModuleService,
  IStockLocationService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MercurModules, SellerStatus } from "@mercurjs/types"
import { createSellerUser } from "../../../helpers/create-seller-user"
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"

jest.setTimeout(120000)

type ListedVariant = {
  id: string
  title: string
  inventory_quantity?: number
  variant_availability?: {
    is_available: boolean
    unavailable_until: string | null
  } | null
}

type ListedProduct = { id: string; variants: ListedVariant[] }

type VariantInput = {
  title: string
  manage_inventory: boolean
  allow_backorder?: boolean
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - Seller products stock availability", () => {
      let appContainer: MedusaContainer
      let sellerId: string
      let sellerHeaders: { headers: Record<string, string> }
      let storeHeaders: { headers: Record<string, string> }
      let salesChannelId: string
      let locationId: string

      beforeAll(() => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        const seller = await createSellerUser(appContainer, {
          email: "stockavail@test.com",
          name: "Stock Avail Seller",
        })
        sellerId = seller.seller.id
        sellerHeaders = seller.headers

        // The storefront only lists open sellers; test sellers start pending.
        await appContainer
          .resolve<{
            updateSellers(data: { id: string; status: SellerStatus }): Promise<unknown>
          }>(MercurModules.SELLER)
          .updateSellers({ id: sellerId, status: SellerStatus.OPEN })

        const salesChannel = await appContainer
          .resolve<ISalesChannelModuleService>(Modules.SALES_CHANNEL)
          .createSalesChannels({ name: "Stock Store" })
        salesChannelId = salesChannel.id

        const location = await appContainer
          .resolve<IStockLocationService>(Modules.STOCK_LOCATION)
          .createStockLocations({ name: "Kitchen" })
        locationId = location.id

        const apiKey = await generatePublishableKey(appContainer)
        storeHeaders = generateStoreHeaders({ publishableKey: apiKey })

        const link = appContainer.resolve(ContainerRegistrationKeys.LINK)
        await link.create([
          {
            [Modules.API_KEY]: { publishable_key_id: apiKey.id },
            [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
          },
          {
            [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
            [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
          },
        ])
      })

      const createProduct = async (variants: VariantInput[]) => {
        const res = await api.post(
          `/vendor/products`,
          {
            status: "published",
            title: "Laddoo",
            options: [{ title: "Size", values: variants.map((v) => v.title) }],
            variants: variants.map((v) => ({
              title: v.title,
              options: { Size: v.title },
              prices: [{ currency_code: "inr", amount: 100 }],
              manage_inventory: v.manage_inventory,
              allow_backorder: v.allow_backorder ?? false,
            })),
            sales_channels: [{ id: salesChannelId }],
          },
          sellerHeaders
        )
        return res.data.product as ListedProduct
      }

      const inventoryItemId = async (variantId: string): Promise<string> => {
        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "variant",
          fields: ["inventory_items.inventory_item_id"],
          filters: { id: variantId },
        })
        return data[0].inventory_items[0].inventory_item_id
      }

      const stock = async (
        variantId: string,
        stocked: number,
        atLocation: string = locationId
      ) => {
        await appContainer
          .resolve<IInventoryService>(Modules.INVENTORY)
          .createInventoryLevels({
            inventory_item_id: await inventoryItemId(variantId),
            location_id: atLocation,
            stocked_quantity: stocked,
          })
      }

      // What a completed order does to stock: reserves the purchased units.
      const purchase = async (variantId: string, quantity: number) => {
        await appContainer
          .resolve<IInventoryService>(Modules.INVENTORY)
          .createReservationItems({
            inventory_item_id: await inventoryItemId(variantId),
            location_id: locationId,
            quantity,
          })
      }

      const listed = async (productId: string) => {
        const res = await api.get(
          `/store/sellers/${sellerId}/products`,
          storeHeaders
        )
        const product = (res.data.products as ListedProduct[]).find(
          (p) => p.id === productId
        )!
        return (title: string) =>
          product.variants.find((v) => v.title === title)!
      }

      const isAvailable = (variant: ListedVariant) =>
        variant.variant_availability?.is_available !== false

      it("marks a variant unavailable once its whole stock is purchased", async () => {
        const product = await createProduct([
          { title: "Box", manage_inventory: true },
          { title: "Single", manage_inventory: true },
        ])
        const box = product.variants.find((v) => v.title === "Box")!
        const single = product.variants.find((v) => v.title === "Single")!
        await stock(box.id, 2)
        await stock(single.id, 5)

        let variant = await listed(product.id)
        expect(isAvailable(variant("Box"))).toBe(true)
        // No availability record and in stock: nothing to report.
        expect(variant("Box").variant_availability ?? null).toBeNull()

        await purchase(box.id, 2)

        variant = await listed(product.id)
        expect(variant("Box").variant_availability).toEqual(
          expect.objectContaining({ is_available: false })
        )
        expect(isAvailable(variant("Single"))).toBe(true)
      })

      it("does not expose stock quantities", async () => {
        const product = await createProduct([
          { title: "Box", manage_inventory: true },
        ])
        await stock(product.variants[0].id, 2)

        const variant = (await listed(product.id))("Box")
        expect(variant).not.toHaveProperty("inventory_quantity")
      })

      it("keeps a variant available at zero stock when backorders are allowed", async () => {
        const product = await createProduct([
          { title: "Box", manage_inventory: true, allow_backorder: true },
        ])
        await stock(product.variants[0].id, 0)

        expect(isAvailable((await listed(product.id))("Box"))).toBe(true)
      })

      it("keeps a variant whose inventory is not tracked available", async () => {
        const product = await createProduct([
          { title: "Box", manage_inventory: false },
        ])

        expect(isAvailable((await listed(product.id))("Box"))).toBe(true)
      })

      it("ignores stock held at a location outside the store's sales channel", async () => {
        const otherLocation = await appContainer
          .resolve<IStockLocationService>(Modules.STOCK_LOCATION)
          .createStockLocations({ name: "Unlinked warehouse" })
        const product = await createProduct([
          { title: "Box", manage_inventory: true },
        ])
        await stock(product.variants[0].id, 10, otherLocation.id)

        expect(isAvailable((await listed(product.id))("Box"))).toBe(false)
      })

      it("keeps a vendor's sold-out mark even when stock remains", async () => {
        const product = await createProduct([
          { title: "Box", manage_inventory: true },
        ])
        const box = product.variants[0]
        await stock(box.id, 5)
        await api.post(
          `/vendor/products/${product.id}/variants/${box.id}/availability`,
          { is_available: false },
          sellerHeaders
        )

        expect(isAvailable((await listed(product.id))("Box"))).toBe(false)
      })

      it("reports a vendor mark whose unavailable_until has passed as available", async () => {
        const product = await createProduct([
          { title: "Box", manage_inventory: true },
        ])
        const box = product.variants[0]
        await stock(box.id, 5)
        await api.post(
          `/vendor/products/${product.id}/variants/${box.id}/availability`,
          {
            is_available: false,
            unavailable_until: new Date(Date.now() - 60_000).toISOString(),
          },
          sellerHeaders
        )

        expect(isAvailable((await listed(product.id))("Box"))).toBe(true)
      })
    })
  },
})
