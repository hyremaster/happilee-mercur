import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { createAdminUser, adminHeaders } from "../../../helpers/create-admin-user"
import { createSellerUser } from "../../../helpers/create-seller-user"
import { createSellerDefaultsWorkflow } from "@mercurjs/core/workflows"

jest.setTimeout(50000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Vendor - Store Onboarding - Delivery Areas", () => {
      let appContainer: MedusaContainer
      let sellerA: any
      let headersA: any
      let headersB: any

      beforeAll(async () => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        await createSellerDefaultsWorkflow(appContainer).run()
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        const a = await createSellerUser(appContainer, {
          email: "areas-a@test.com",
          name: "Areas Store A",
        })
        sellerA = a.seller
        headersA = a.headers

        const b = await createSellerUser(appContainer, {
          email: "areas-b@test.com",
          name: "Areas Store B",
        })
        headersB = b.headers
      })

      const path = (sellerId: string) =>
        `/vendor/store-onboarding/${sellerId}/delivery-areas`

      it("saves and lists delivery areas", async () => {
        const save = await api.post(
          path(sellerA.id),
          {
            areas: [
              { area_sense_id: "AS-101", area_name: "Kochi Central" },
              { area_sense_id: "AS-102", area_name: "Edappally" },
            ],
          },
          headersA
        )
        expect(save.status).toBe(200)
        expect(save.data.delivery_areas).toHaveLength(2)

        const list = await api.get(path(sellerA.id), headersA)
        expect(list.status).toBe(200)
        expect(list.data.delivery_areas).toHaveLength(2)
        expect(
          list.data.delivery_areas.map((a: any) => a.area_sense_id).sort()
        ).toEqual(["AS-101", "AS-102"])
      })

      it("replaces existing areas on re-save", async () => {
        await api.post(
          path(sellerA.id),
          {
            areas: [
              { area_sense_id: "AS-101", area_name: "Kochi Central" },
              { area_sense_id: "AS-102", area_name: "Edappally" },
            ],
          },
          headersA
        )

        await api.post(
          path(sellerA.id),
          { areas: [{ area_sense_id: "AS-103", area_name: "Kakkanad" }] },
          headersA
        )

        const list = await api.get(path(sellerA.id), headersA)
        expect(list.data.delivery_areas).toHaveLength(1)
        expect(list.data.delivery_areas[0].area_sense_id).toBe("AS-103")
      })

      it("deletes a single delivery area", async () => {
        await api.post(
          path(sellerA.id),
          {
            areas: [
              { area_sense_id: "AS-101", area_name: "Kochi Central" },
              { area_sense_id: "AS-102", area_name: "Edappally" },
            ],
          },
          headersA
        )

        const del = await api.delete(`${path(sellerA.id)}/AS-101`, headersA)
        expect(del.status).toBe(200)
        expect(del.data.deleted).toBe(true)

        const list = await api.get(path(sellerA.id), headersA)
        expect(list.data.delivery_areas).toHaveLength(1)
        expect(list.data.delivery_areas[0].area_sense_id).toBe("AS-102")
      })

      it("blocks access to another seller's store", async () => {
        await expect(
          api.get(path(sellerA.id), headersB)
        ).rejects.toMatchObject({
          response: { status: expect.any(Number) },
        })
      })

      describe("Area Sense proxy", () => {
        const realFetch = global.fetch

        afterEach(() => {
          global.fetch = realFetch
          delete process.env.AREASENSE_API_URL
          delete process.env.AREASENSE_API_KEY
        })

        it("returns mapped areas from the external service", async () => {
          process.env.AREASENSE_API_URL = "https://area-sense.example"
          process.env.AREASENSE_API_KEY = "test-key"
          global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
              message: "ok",
              data: [
                { id: "AS-1", area_name: "Area One", is_active: true },
                { id: "AS-2", area_name: "Area Two", is_active: true },
              ],
              total_count: "2",
            }),
          }) as unknown as typeof fetch

          const res = await api.get(
            "/vendor/store-onboarding/area-sense/areas?search=area",
            headersA
          )
          expect(res.status).toBe(200)
          expect(res.data.areas).toHaveLength(2)
          expect(res.data.areas[0]).toMatchObject({
            area_sense_id: "AS-1",
            area_name: "Area One",
          })
        })

        it("errors when Area Sense is not configured", async () => {
          await expect(
            api.get("/vendor/store-onboarding/area-sense/areas", headersA)
          ).rejects.toMatchObject({
            response: { status: 400 },
          })
        })
      })
    })
  },
})
