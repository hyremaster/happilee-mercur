import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { MercurModules } from "@mercurjs/types"
import { createAdminUser, adminHeaders } from "../../../helpers/create-admin-user"
import { createSellerDefaultsWorkflow } from "@mercurjs/core/workflows"

jest.setTimeout(60000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Vendor - Store Onboarding - Payment Gateways (draft flow)", () => {
      let appContainer: MedusaContainer
      let token: string
      let email: string

      const headers = () => ({
        headers: { authorization: `Bearer ${token}` },
      })

      beforeAll(async () => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        await createSellerDefaultsWorkflow(appContainer).run()
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        email = `gw-${Date.now()}@test.com`
        const reg = await api.post("/auth/member/emailpass/register", {
          email,
          password: "somepassword",
        })
        token = reg.data.token
      })

      const gatewaysPayload = [
        {
          gateway: "razorpay",
          is_active: true,
          credentials: {
            key_id: "rzp_test_123",
            key_secret: "super-secret-value",
            webhook_secret: "whsec_abc",
          },
          metadata: {
            method_name: "Primary Razorpay",
            client_id: "pm-01",
          },
        },
        {
          gateway: "razorpay",
          is_active: false,
          credentials: {
            key_id: "rzp_test_456",
            key_secret: "another-secret",
            webhook_secret: "whsec_def",
          },
          metadata: {
            method_name: "Secondary Razorpay",
            client_id: "pm-02",
          },
        },
      ]

      it("carries payment_gateways through draft, masks on read, materializes on submit", async () => {
        const draftRes = await api.post(
          "/vendor/store-onboarding/drafts",
          {},
          headers()
        )
        const draftId = draftRes.data.draft.id

        await api.post(
          `/vendor/store-onboarding/drafts/${draftId}`,
          { step: 1, data: { name: "GW Store", email, currency_code: "inr" } },
          headers()
        )

        const saveRes = await api.post(
          `/vendor/store-onboarding/drafts/${draftId}`,
          {
            step: 3,
            data: {
              payment: { online_enabled: true, currency_code: "inr" },
              payment_gateways: gatewaysPayload,
            },
          },
          headers()
        )

        const savedGateways =
          saveRes.data.draft.draft_data.fulfillment.payment_gateways
        expect(savedGateways).toHaveLength(2)
        expect(savedGateways[0].credentials.key_id).toBe("rzp_test_123")
        expect(savedGateways[0].credentials.key_secret).toBe("***")
        expect(savedGateways[0].credentials.webhook_secret).toBe("***")
        expect(savedGateways[1].is_active).toBe(false)

        const resume = await api.get(
          `/vendor/store-onboarding/drafts/${draftId}`,
          headers()
        )
        expect(
          resume.data.draft.draft_data.fulfillment.payment_gateways[0]
            .credentials.key_secret
        ).toBe("***")

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
        const gws = detail.data.store.payment_gateways
        expect(gws).toHaveLength(2)
        expect(gws).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              gateway: "razorpay",
              is_active: true,
            }),
            expect.objectContaining({
              gateway: "razorpay",
              is_active: false,
            }),
          ])
        )
        expect(gws[0].credentials.key_secret).toBe("***")

        const service = appContainer.resolve(MercurModules.MARKETPLACE_PROFILE)
        const stored = await service.listStorePaymentGateways({
          seller_id: sellerId,
        })
        expect(stored).toHaveLength(2)
        const active = stored.find((row: { is_active: boolean }) => row.is_active)
        expect(active?.credentials.key_secret).toBe("super-secret-value")
        expect(active?.credentials.webhook_secret).toBe("whsec_abc")
      })
    })
  },
})
