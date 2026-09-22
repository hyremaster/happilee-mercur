import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ICustomerModuleService, MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"
import { generateKeyPairSync } from "crypto"
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"

jest.setTimeout(60000)

// Firebase ID tokens are RS256 JWTs signed by Google. The verifier fetches
// Google's public certs; here we stand in our own keypair and serve its public
// key as the cert for our test `kid`, so we can mint valid tokens offline.
const PROJECT_ID = "happilee-live"
const KID = "test-kid-1"
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`
const CERTS_HOST = "securetoken@system.gserviceaccount.com"

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
})

const signToken = (
  claims: Record<string, unknown>,
  opts: { sub?: string; aud?: string; iss?: string; kid?: string } = {}
) =>
  jwt.sign(claims, privateKey, {
    algorithm: "RS256",
    keyid: opts.kid ?? KID,
    subject: opts.sub ?? "firebase-uid-1",
    audience: opts.aud ?? PROJECT_ID,
    issuer: opts.iss ?? ISSUER,
    expiresIn: "1h",
  })

const decode = (token: string) =>
  jwt.decode(token) as {
    actor_id: string
    actor_type: string
    app_metadata: { customer_id: string }
  }

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - Firebase phone auth (JWKS)", () => {
      let appContainer: MedusaContainer
      let storeHeaders: { headers: Record<string, string> }
      let realFetch: typeof global.fetch

      beforeAll(async () => {
        appContainer = getContainer()
        process.env.FIREBASE_PROJECT_ID = PROJECT_ID
      })

      afterAll(() => {
        delete process.env.FIREBASE_PROJECT_ID
      })

      beforeEach(async () => {
        const apiKey = await generatePublishableKey(appContainer)
        storeHeaders = generateStoreHeaders({ publishableKey: apiKey })

        // Serve our public key as Google's cert for KID; pass everything else
        // through to the real fetch.
        realFetch = global.fetch
        global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString()
          if (url.includes(CERTS_HOST)) {
            return new Response(JSON.stringify({ [KID]: publicKey }), {
              status: 200,
              headers: { "content-type": "application/json", "cache-control": "max-age=3600" },
            })
          }
          return realFetch(input, init)
        }) as typeof global.fetch
      })

      afterEach(() => {
        global.fetch = realFetch
      })

      const phoneClaims = (phone: string) => ({
        phone_number: phone,
        firebase: { sign_in_provider: "phone" },
      })

      it("mints a customer token for a verified phone id_token", async () => {
        const idToken = signToken(phoneClaims("+15551230001"))
        const res = await api.post(
          "/store/auth/firebase/verify",
          { id_token: idToken },
          storeHeaders
        )

        expect(res.status).toEqual(200)
        const payload = decode(res.data.token)
        expect(payload.actor_type).toBe("customer")
        expect(payload.app_metadata.customer_id).toBeTruthy()

        const customerService = appContainer.resolve<ICustomerModuleService>(
          Modules.CUSTOMER
        )
        const customer = await customerService.retrieveCustomer(payload.actor_id)
        expect(customer.phone).toBe("+15551230001")
      })

      it("reuses the same customer on a second login for the same phone", async () => {
        const first = await api.post(
          "/store/auth/firebase/verify",
          { id_token: signToken(phoneClaims("+15551230002")) },
          storeHeaders
        )
        const second = await api.post(
          "/store/auth/firebase/verify",
          { id_token: signToken(phoneClaims("+15551230002")) },
          storeHeaders
        )
        expect(decode(first.data.token).app_metadata.customer_id).toEqual(
          decode(second.data.token).app_metadata.customer_id
        )
      })

      it("unifies with a customer that already exists for the phone", async () => {
        const phone = "+15551230003"
        const customerService = appContainer.resolve<ICustomerModuleService>(
          Modules.CUSTOMER
        )
        const existing = await customerService.createCustomers({
          phone,
          email: "15551230003@phone.happilee.local",
        })

        const res = await api.post(
          "/store/auth/firebase/verify",
          { id_token: signToken(phoneClaims(phone)) },
          storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(decode(res.data.token).app_metadata.customer_id).toEqual(
          existing.id
        )
      })

      it("rejects a non-phone sign-in with 401", async () => {
        const idToken = signToken({
          phone_number: "+15551230004",
          firebase: { sign_in_provider: "password" },
        })
        await expect(
          api.post(
            "/store/auth/firebase/verify",
            { id_token: idToken },
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 401 } })
      })

      it("rejects a token with the wrong audience with 401", async () => {
        const idToken = signToken(phoneClaims("+15551230005"), {
          aud: "some-other-project",
        })
        await expect(
          api.post(
            "/store/auth/firebase/verify",
            { id_token: idToken },
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 401 } })
      })
    })
  },
})
