import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { MercurModules } from "@mercurjs/types"
import { createAdminUser, adminHeaders } from "../../../helpers/create-admin-user"
import { createSellerDefaultsWorkflow } from "@mercurjs/core/workflows"

jest.setTimeout(60000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Vendor - Store Onboarding - Payment Gateway (draft flow)", () => {
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

      const gatewayPayload = {
        gateway: "razorpay",
        is_active: true,
        credentials: {
          key_id: "rzp_test_123",
          key_secret: "super-secret-value",
          webhook_secret: "whsec_abc",
        },
      }

      it("carries gateway through draft, masks on read, materializes on submit, stores raw", async () => {
        // 1. start draft
        const draftRes = await api.post(
          "/vendor/store-onboarding/drafts",
          {},
          headers()
        )
        const draftId = draftRes.data.draft.id

        // 2. step 1 business (name+email required to submit)
        await api.post(
          `/vendor/store-onboarding/drafts/${draftId}`,
          { step: 1, data: { name: "GW Store", email, currency_code: "inr" } },
          headers()
        )

        // 3. step 3 fulfillment — includes payment_gateway with secrets
        const saveRes = await api.post(
          `/vendor/store-onboarding/drafts/${draftId}`,
          { step: 3, data: { payment_gateway: gatewayPayload } },
          headers()
        )
        // response must NOT echo the secret back
        const savedGw =
          saveRes.data.draft.draft_data.fulfillment.payment_gateway
        expect(savedGw.credentials.key_id).toBe("rzp_test_123")
        expect(savedGw.credentials.key_secret).toBe("***")
        expect(savedGw.credentials.webhook_secret).toBe("***")

        // 4. resume — still masked
        const resume = await api.get(
          `/vendor/store-onboarding/drafts/${draftId}`,
          headers()
        )
        expect(
          resume.data.draft.draft_data.fulfillment.payment_gateway.credentials
            .key_secret
        ).toBe("***")

        // 5. submit → materialize
        const submit = await api.post(
          `/vendor/store-onboarding/drafts/${draftId}/submit`,
          {},
          headers()
        )
        const sellerId = submit.data.seller_id

        // 6. detail returns masked gateway
        const detail = await api.get(
          `/vendor/store-onboarding/${sellerId}`,
          headers()
        )
        const gws = detail.data.store.payment_gateways
        expect(gws).toHaveLength(1)
        expect(gws[0]).toMatchObject({
          gateway: "razorpay",
          is_active: true,
        })
        expect(gws[0].credentials.key_id).toBe("rzp_test_123")
        expect(gws[0].credentials.key_secret).toBe("***")

        // 7. raw secret is actually persisted (read straight from the module)
        const service = appContainer.resolve(MercurModules.MARKETPLACE_PROFILE)
        const [stored] = await service.listStorePaymentGateways({
          seller_id: sellerId,
        })
        expect(stored.credentials.key_secret).toBe("super-secret-value")
        expect(stored.credentials.webhook_secret).toBe("whsec_abc")
      })
    })
  },
})
