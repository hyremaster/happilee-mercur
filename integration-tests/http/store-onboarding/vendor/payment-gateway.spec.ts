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
        label: "Main",
        is_active: true,
        credentials: {
          key_id: "rzp_test_123",
          key_secret: "super-secret-value",
          webhook_secret: "whsec_abc",
        },
      }

      // Create a submitted store (via draft submit) and return its seller id.
      const createStore = async (): Promise<string> => {
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
        const submit = await api.post(
          `/vendor/store-onboarding/drafts/${draftId}/submit`,
          {},
          headers()
        )
        return submit.data.seller_id
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

      it("supports multiple accounts of the same gateway via CRUD, enforcing single-active", async () => {
        const sellerId = await createStore()
        const base = `/vendor/store-onboarding/${sellerId}/payment-gateways`

        // add two razorpay accounts — Main active, Backup inactive
        const mainRes = await api.post(
          base,
          { ...gatewayPayload, label: "Main", is_active: true },
          headers()
        )
        expect(mainRes.data.payment_gateway.credentials.key_secret).toBe("***")
        const backupRes = await api.post(
          base,
          {
            gateway: "razorpay",
            label: "Backup",
            is_active: false,
            credentials: { key_id: "rzp_b", key_secret: "s2" },
          },
          headers()
        )
        const backupId = backupRes.data.payment_gateway.id

        // list -> 2 rows, secrets masked, only Main active
        const list = await api.get(base, headers())
        expect(list.data.payment_gateways).toHaveLength(2)
        const active = list.data.payment_gateways.filter(
          (g: { is_active: boolean }) => g.is_active
        )
        expect(active).toHaveLength(1)
        expect(active[0].label).toBe("Main")

        // activate Backup -> Main auto-deactivates (single-active invariant)
        await api.post(`${base}/${backupId}`, { is_active: true }, headers())
        const afterActivate = await api.get(base, headers())
        const active2 = afterActivate.data.payment_gateways.filter(
          (g: { is_active: boolean }) => g.is_active
        )
        expect(active2).toHaveLength(1)
        expect(active2[0].label).toBe("Backup")

        // delete Backup -> 1 row remains
        await api.delete(`${base}/${backupId}`, headers())
        const afterDelete = await api.get(base, headers())
        expect(afterDelete.data.payment_gateways).toHaveLength(1)
        expect(afterDelete.data.payment_gateways[0].label).toBe("Main")
      })

      it("materializes multiple gateways from a draft payment_gateways[]", async () => {
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
        await api.post(
          `/vendor/store-onboarding/drafts/${draftId}`,
          {
            step: 3,
            data: {
              payment_gateways: [
                { ...gatewayPayload, label: "Main", is_active: true },
                {
                  gateway: "razorpay",
                  label: "Backup",
                  is_active: true, // batch keeps only the first active per gateway
                  credentials: { key_id: "rzp_b", key_secret: "s2" },
                },
              ],
            },
          },
          headers()
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
        const gws = detail.data.store.payment_gateways
        expect(gws).toHaveLength(2)
        const active = gws.filter((g: { is_active: boolean }) => g.is_active)
        expect(active).toHaveLength(1)
        expect(active[0].label).toBe("Main")
      })
    })
  },
})
