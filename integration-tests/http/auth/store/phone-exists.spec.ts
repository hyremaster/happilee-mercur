import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ICustomerModuleService, MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"

jest.setTimeout(60000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - Phone account existence check", () => {
      let appContainer: MedusaContainer
      let storeHeaders: { headers: Record<string, string> }

      beforeAll(() => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        const apiKey = await generatePublishableKey(appContainer)
        storeHeaders = generateStoreHeaders({ publishableKey: apiKey })
      })

      it("returns exists:true for a phone that already has a customer", async () => {
        const customerService = appContainer.resolve<ICustomerModuleService>(
          Modules.CUSTOMER
        )
        await customerService.createCustomers({
          phone: "+15559990001",
          email: "15559990001@phone.happilee.local",
        })

        const res = await api.post(
          "/store/auth/phone/exists",
          { phone: "+15559990001" },
          storeHeaders
        )

        expect(res.status).toEqual(200)
        expect(res.data.exists).toBe(true)
      })

      it("returns exists:false for an unknown phone", async () => {
        const res = await api.post(
          "/store/auth/phone/exists",
          { phone: "+15550000000" },
          storeHeaders
        )

        expect(res.status).toEqual(200)
        expect(res.data.exists).toBe(false)
      })

      it("normalizes the phone (matches regardless of formatting)", async () => {
        const customerService = appContainer.resolve<ICustomerModuleService>(
          Modules.CUSTOMER
        )
        await customerService.createCustomers({
          phone: "+15559990002",
          email: "15559990002@phone.happilee.local",
        })

        // Sent without the leading "+" — normalizePhone should still match.
        const res = await api.post(
          "/store/auth/phone/exists",
          { phone: "15559990002" },
          storeHeaders
        )

        expect(res.data.exists).toBe(true)
      })
    })
  },
})
