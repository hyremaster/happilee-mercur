import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { StoreOrderStatusType } from "@mercurjs/types"
import { createAdminUser, adminHeaders } from "../../../helpers/create-admin-user"
import { createSellerDefaultsWorkflow } from "@mercurjs/core/workflows"

jest.setTimeout(60000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Vendor - Store Onboarding - Order statuses (draft flow)", () => {
      let appContainer: MedusaContainer
      let token: string
      let email: string

      const headers = () => ({
        headers: { authorization: `Bearer ${token}` },
      })

      const customOrderStatuses = [
        {
          status: StoreOrderStatusType.ORDER_PLACED,
          display_name: "We got your order",
          color: "#2563EB",
          is_active: true,
          is_required: true,
          rank: 0,
        },
        {
          status: StoreOrderStatusType.CONFIRMED,
          display_name: "Kitchen confirmed",
          color: "#16A34A",
          is_active: false,
          is_required: false,
          rank: 1,
        },
      ]

      beforeAll(async () => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        await createSellerDefaultsWorkflow(appContainer).run()
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        email = `statuses-${Date.now()}@test.com`
        const reg = await api.post("/auth/member/emailpass/register", {
          email,
          password: "somepassword",
        })
        token = reg.data.token
      })

      it("persists commerce order_statuses on draft step 2 and materializes on submit", async () => {
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
            data: { name: "Status Store", email, currency_code: "inr" },
          },
          headers()
        )

        const saveRes = await api.post(
          `/vendor/store-onboarding/drafts/${draftId}`,
          {
            step: 2,
            data: {
              commerce_type: "local_delivery",
              fulfillment_methods: ["delivery", "pickup"],
              order_statuses: customOrderStatuses,
            },
          },
          headers()
        )

        expect(saveRes.data.draft.draft_data.commerce.order_statuses).toEqual(
          customOrderStatuses
        )

        const resume = await api.get(
          `/vendor/store-onboarding/drafts/${draftId}`,
          headers()
        )
        expect(resume.data.draft.draft_data.commerce.order_statuses).toEqual(
          customOrderStatuses
        )

        const submit = await api.post(
          `/vendor/store-onboarding/drafts/${draftId}/submit`,
          {},
          headers()
        )
        const sellerId = submit.data.seller_id

        const detail = await api.get(
          `/vendor/store-onboarding/${sellerId}`,
          headers()
        )

        expect(detail.data.store.store_profile.order_statuses).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              status: StoreOrderStatusType.ORDER_PLACED,
              display_name: "We got your order",
              is_active: true,
              is_required: true,
              rank: 0,
            }),
            expect.objectContaining({
              status: StoreOrderStatusType.CONFIRMED,
              display_name: "Kitchen confirmed",
              is_active: false,
              is_required: false,
              rank: 1,
            }),
          ])
        )
      })
    })
  },
})
