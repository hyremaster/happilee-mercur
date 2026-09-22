import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { createAdminUser, adminHeaders } from "../../../helpers/create-admin-user"
import { createSellerUser } from "../../../helpers/create-seller-user"
import { createSellerDefaultsWorkflow } from "@mercurjs/core/workflows"

jest.setTimeout(50000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Vendor - Store Onboarding - Business Details update", () => {
      let appContainer: MedusaContainer
      let seller: any
      let headers: any

      beforeAll(async () => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        await createSellerDefaultsWorkflow(appContainer).run()
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        const s = await createSellerUser(appContainer, {
          email: "biz@test.com",
          name: "Biz Store",
        })
        seller = s.seller
        headers = s.headers
      })

      it("updates seller core fields, address and professional details", async () => {
        const res = await api.post(
          `/vendor/store-onboarding/${seller.id}`,
          {
            name: "GreenMart Updated",
            phone: "+919876543210",
            industry: "grocery",
            professional_details: {
              corporate_name: "GreenMart Pvt Ltd",
              tax_id: "27AAACC1234B1Z5",
            },
            address: {
              address_1: "123 Commerce Street, Floor 4",
              country_code: "in",
              province: "Maharashtra",
              city: "Mumbai",
              postal_code: "400001",
            },
          },
          headers
        )
        expect(res.status).toBe(200)
        expect(res.data.store).toMatchObject({
          id: seller.id,
          name: "GreenMart Updated",
          phone: "+919876543210",
        })
        expect(res.data.store.store_profile.industry).toBe("grocery")

        // Confirm persisted via detail endpoint (seller graph includes relations).
        const detail = await api.get(
          `/vendor/store-onboarding/${seller.id}`,
          headers
        )
        expect(detail.status).toBe(200)
        expect(detail.data.store.name).toBe("GreenMart Updated")
        expect(detail.data.store.address).toMatchObject({
          address_1: "123 Commerce Street, Floor 4",
          city: "Mumbai",
          province: "Maharashtra",
          postal_code: "400001",
        })
        expect(detail.data.store.professional_details).toMatchObject({
          corporate_name: "GreenMart Pvt Ltd",
          tax_id: "27AAACC1234B1Z5",
        })
      })
    })
  },
})
