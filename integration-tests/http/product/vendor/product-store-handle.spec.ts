import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { MercurModules, SellerStatus } from "@mercurjs/types"
import { createSellerUser } from "../../../helpers/create-seller-user"
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"

jest.setTimeout(120000)

type Headers = { headers: Record<string, string> }
type ProductRow = { id: string; title: string; handle: string }
type ErrorResponse = { status: number; data: { message?: string } }

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Vendor - Store-scoped product handles", () => {
      let appContainer: MedusaContainer
      let storeA: { id: string; headers: Headers }
      let storeB: { id: string; headers: Headers }

      beforeAll(() => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        const a = await createSellerUser(appContainer, {
          email: "store-a@test.com",
          name: "Store A",
        })
        const b = await createSellerUser(appContainer, {
          email: "store-b@test.com",
          name: "Store B",
        })
        storeA = { id: a.seller.id, headers: a.headers }
        storeB = { id: b.seller.id, headers: b.headers }
      })

      const createProduct = (
        store: { headers: Headers },
        body: { title: string; handle?: string }
      ) =>
        api
          .post(
            `/vendor/products`,
            {
              ...body,
              status: "published",
              options: [{ title: "Default", values: ["Default"] }],
            },
            store.headers
          )
          .catch((e: { response: ErrorResponse }) => e.response)

      const updateProduct = (
        store: { headers: Headers },
        id: string,
        body: Record<string, unknown>
      ) =>
        api
          .post(`/vendor/products/${id}`, body, store.headers)
          .catch((e: { response: ErrorResponse }) => e.response)

      it("lets two stores use the same handle", async () => {
        const inA = await createProduct(storeA, { title: "Laddoo" })
        const inB = await createProduct(storeB, { title: "Laddoo" })

        expect(inA.status).toEqual(201)
        expect(inB.status).toEqual(201)
        expect(inA.data.product.handle).toEqual("laddoo")
        expect(inB.data.product.handle).toEqual("laddoo")
      })

      it("rejects a handle already used by another product in the same store", async () => {
        await createProduct(storeA, { title: "Laddoo" })

        const fromTitle = await createProduct(storeA, { title: "Laddoo" })
        expect(fromTitle.status).toEqual(400)
        expect(fromTitle.data.message).toContain(`"laddoo"`)

        const explicit = await createProduct(storeA, {
          title: "Motichoor",
          handle: "laddoo",
        })
        expect(explicit.status).toEqual(400)
      })

      it("uses a vendor-supplied handle", async () => {
        const res = await createProduct(storeA, {
          title: "Motichoor Laddoo",
          handle: "sweet-laddoo",
        })
        expect(res.status).toEqual(201)
        expect(res.data.product.handle).toEqual("sweet-laddoo")
      })

      it("shows store handles on the vendor product list and detail", async () => {
        const created = await createProduct(storeB, { title: "Laddoo" })
        const id = created.data.product.id

        const detail = await api.get(`/vendor/products/${id}`, storeB.headers)
        expect(detail.data.product.handle).toEqual("laddoo")

        const list = await api.get(`/vendor/products`, storeB.headers)
        const row = (list.data.products as ProductRow[]).find((p) => p.id === id)
        expect(row?.handle).toEqual("laddoo")

        const filtered = await api.get(
          `/vendor/products?handle=laddoo`,
          storeB.headers
        )
        expect(
          (filtered.data.products as ProductRow[]).map((p) => p.id)
        ).toEqual([id])
      })

      it("changes a product's handle within the store's namespace", async () => {
        const laddoo = (await createProduct(storeA, { title: "Laddoo" })).data
          .product
        const jalebi = (await createProduct(storeA, { title: "Jalebi" })).data
          .product
        // Another store owning a handle does not block this store.
        await createProduct(storeB, { title: "Sweet Jalebi" })

        const taken = await updateProduct(storeA, jalebi.id, {
          handle: "laddoo",
        })
        expect(taken.status).toEqual(400)

        const renamed = await updateProduct(storeA, jalebi.id, {
          handle: "sweet-jalebi",
        })
        expect(renamed.status).toEqual(200)
        expect(renamed.data.product.handle).toEqual("sweet-jalebi")

        // Saving a product with its own handle is not a conflict.
        const unchanged = await updateProduct(storeA, laddoo.id, {
          handle: "laddoo",
          title: "Laddoo (box)",
        })
        expect(unchanged.status).toEqual(200)
        expect(unchanged.data.product.handle).toEqual("laddoo")
      })

      it("frees a handle when its product is deleted", async () => {
        const first = (await createProduct(storeA, { title: "Laddoo" })).data
          .product
        await api.delete(`/vendor/products/${first.id}`, storeA.headers)

        const again = await createProduct(storeA, { title: "Laddoo" })
        expect(again.status).toEqual(201)
        expect(again.data.product.handle).toEqual("laddoo")
      })

      it("finds a product by its store handle on the storefront", async () => {
        const sellerModule = appContainer.resolve<{
          updateSellers(data: { id: string; status: SellerStatus }): Promise<unknown>
        }>(MercurModules.SELLER)
        await sellerModule.updateSellers({ id: storeA.id, status: SellerStatus.OPEN })
        await sellerModule.updateSellers({ id: storeB.id, status: SellerStatus.OPEN })

        const inA = (await createProduct(storeA, { title: "Laddoo" })).data.product
        const inB = (await createProduct(storeB, { title: "Laddoo" })).data.product
        await createProduct(storeA, { title: "Jalebi" })

        const storeHeaders = generateStoreHeaders({
          publishableKey: await generatePublishableKey(appContainer),
        })

        const listed = await api.get(
          `/store/sellers/${storeA.id}/products`,
          storeHeaders
        )
        const handles = (listed.data.products as ProductRow[])
          .map((p) => p.handle)
          .sort()
        expect(handles).toEqual(["jalebi", "laddoo"])

        const byHandleA = await api.get(
          `/store/sellers/${storeA.id}/products?handle=laddoo`,
          storeHeaders
        )
        expect(
          (byHandleA.data.products as ProductRow[]).map((p) => p.id)
        ).toEqual([inA.id])

        const byHandleB = await api.get(
          `/store/sellers/${storeB.id}/products?handle=laddoo`,
          storeHeaders
        )
        expect(
          (byHandleB.data.products as ProductRow[]).map((p) => p.id)
        ).toEqual([inB.id])
      })
    })
  },
})
