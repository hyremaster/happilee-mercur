import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { MercurModules, StoreOnboardingDraftStatus } from "@mercurjs/types"
import jwt from "jsonwebtoken"

import { createAdminUser, adminHeaders } from "../../../helpers/create-admin-user"

jest.setTimeout(60000)

const SSO_SECRET = "test-sso-secret"

// Axios config: don't follow the /sso redirect (it points at the vendor SPA on
// another port) and don't throw on 3xx/4xx so we can assert on the response.
const noFollow = {
  maxRedirects: 0,
  validateStatus: () => true,
}

const signToken = (payload: Record<string, unknown>) =>
  jwt.sign(payload, SSO_SECRET, { expiresIn: "5m" })

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("SSO - Happilee API key ingestion", () => {
      let appContainer: MedusaContainer

      beforeAll(async () => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        await createAdminUser(dbConnection, adminHeaders, appContainer)
        process.env.HAPPILEE_SSO_SECRET = SSO_SECRET
      })

      afterEach(() => {
        delete process.env.HAPPILEE_SSO_SECRET
      })

      const service = () =>
        appContainer.resolve(MercurModules.MARKETPLACE_PROFILE)

      it("seeds the api key onto the draft for a new project (and never returns it to the client)", async () => {
        const projectId = `proj_${Date.now()}`
        const token = signToken({
          project_id: projectId,
          user_id: "u1",
          email: `sso-${projectId}@test.com`,
          name: "SSO User",
          api_key: "seller-key",
          jti: `jti_${projectId}`,
        })

        const res = await api.get(`/sso?token=${token}`, noFollow)
        expect(res.status).toBe(302)
        expect(res.headers.location).toContain("sso_token=")
        // The minted mercur token must not carry the secret key.
        expect(res.headers.location).not.toContain("seller-key")

        // The draft holds the key in its dedicated column (read via service).
        const [draft] = await service().listStoreOnboardingDrafts(
          {
            status: StoreOnboardingDraftStatus.DRAFT,
            metadata: { happilee_external_id: `happilee_${projectId}` },
          } as Record<string, unknown>,
          { take: 1 }
        )
        expect(draft).toBeDefined()
        expect(draft.happilee_api_key).toBe("seller-key")
      })

      it("seeds the api key onto a store created in-dashboard (no per-store SSO)", async () => {
        const projectId = `proj_indash_${Date.now()}`
        const email = `indash-${projectId}@test.com`
        const token = signToken({
          project_id: projectId,
          user_id: "u1",
          email,
          name: "Indash User",
          api_key: "seller-key",
          jti: `jti_indash_${projectId}`,
        })

        // 1. SSO binds the key to the identity (server-side).
        const ssoRes = await api.get(`/sso?token=${token}`, noFollow)
        expect(ssoRes.status).toBe(302)
        const location: string = ssoRes.headers.location
        const mercurToken = new URL(location, "http://x").searchParams.get(
          "sso_token"
        )
        expect(mercurToken).toBeTruthy()
        expect(location).not.toContain("seller-key")

        const authedHeaders = {
          headers: { authorization: `Bearer ${mercurToken}` },
        }

        // 2. Vendor creates a brand-new store from inside the dashboard.
        const createRes = await api.post(
          "/vendor/store-onboarding",
          {
            name: "In-dashboard Store",
            email,
            member_email: email,
            currency_code: "inr",
          },
          authedHeaders
        )
        expect(createRes.status).toBe(201)
        const sellerId = createRes.data.store.seller.id
        // The secret must not appear in the create response.
        expect(JSON.stringify(createRes.data)).not.toContain("seller-key")

        // 3. The store's profile inherited the authorizing key (read via service).
        const [profile] = await service().listStoreProfiles({
          seller_id: sellerId,
        })
        expect(profile).toBeDefined()
        expect(profile.happilee_api_key).toBe("seller-key")
      })

      it("seeds the api key onto a store submitted from an in-dashboard draft", async () => {
        const projectId = `proj_wizard_${Date.now()}`
        const email = `wizard-${projectId}@test.com`
        const token = signToken({
          project_id: projectId,
          user_id: "u1",
          email,
          name: "Wizard User",
          api_key: "seller-key",
          jti: `jti_wizard_${projectId}`,
        })

        const ssoRes = await api.get(`/sso?token=${token}`, noFollow)
        expect(ssoRes.status).toBe(302)
        const mercurToken = new URL(
          ssoRes.headers.location,
          "http://x"
        ).searchParams.get("sso_token")
        const authedHeaders = {
          headers: { authorization: `Bearer ${mercurToken}` },
        }

        // Drafts created from the dashboard wizard carry no key of their own.
        const draftRes = await api.post(
          "/vendor/store-onboarding/drafts",
          {},
          authedHeaders
        )
        const draftId = draftRes.data.draft.id
        await api.post(
          `/vendor/store-onboarding/drafts/${draftId}`,
          {
            step: 1,
            data: {
              name: "Wizard Store",
              email,
              currency_code: "inr",
              address: { country_code: "in", city: "Kochi" },
            },
          },
          authedHeaders
        )
        await api.post(
          `/vendor/store-onboarding/drafts/${draftId}`,
          {
            step: 2,
            data: { commerce_type: "local_delivery", fulfillment_methods: [] },
          },
          authedHeaders
        )

        const submitRes = await api.post(
          `/vendor/store-onboarding/drafts/${draftId}/submit`,
          {},
          authedHeaders
        )
        expect(JSON.stringify(submitRes.data)).not.toContain("seller-key")

        const [profile] = await service().listStoreProfiles({
          seller_id: submitRes.data.seller_id,
        })
        expect(profile).toBeDefined()
        expect(profile.happilee_api_key).toBe("seller-key")
      })

      it("rejects a replayed (already-used) key-bearing token", async () => {
        const projectId = `proj_replay_${Date.now()}`
        const token = signToken({
          project_id: projectId,
          user_id: "u1",
          email: `replay-${projectId}@test.com`,
          name: "Replay User",
          api_key: "seller-key",
          jti: `jti_replay_${projectId}`,
        })

        const first = await api.get(`/sso?token=${token}`, noFollow)
        expect(first.status).toBe(302)

        const second = await api.get(`/sso?token=${token}`, noFollow)
        expect(second.status).toBe(401)
      })

      it("rejects a key-bearing token with no jti", async () => {
        const projectId = `proj_nojti_${Date.now()}`
        const token = signToken({
          project_id: projectId,
          user_id: "u1",
          email: `nojti-${projectId}@test.com`,
          name: "No Jti User",
          api_key: "seller-key",
        })

        const res = await api.get(`/sso?token=${token}`, noFollow)
        expect(res.status).toBe(400)
      })
    })
  },
})
