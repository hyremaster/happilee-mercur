import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { MercurModules, SellerStatus } from "@mercurjs/types"
import jwt from "jsonwebtoken"
import { generateKeyPairSync } from "crypto"

import { createSellerUser } from "../../../helpers/create-seller-user"
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"

jest.setTimeout(120000)

const PROJECT_ID = "happilee-live"
const KID = "test-kid-1"
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`
const CERTS_HOST = "securetoken@system.gserviceaccount.com"

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
})

const signToken = (phone: string) =>
  jwt.sign(
    { phone_number: phone, firebase: { sign_in_provider: "phone" } },
    privateKey,
    {
      algorithm: "RS256",
      keyid: KID,
      subject: "firebase-uid-1",
      audience: PROJECT_ID,
      issuer: ISSUER,
      expiresIn: "1h",
    }
  )

/**
 * Phase 3 of store-scoped customers (docs/store-scoped-customers.md): a session
 * minted at one store is refused by another. A session minted before stores had
 * accounts (no seller_id claim) is refused on any store-scoped request, which
 * costs the shopper one re-login.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - session is bound to its store", () => {
      let appContainer: MedusaContainer
      let storeA: any
      let storeB: any
      let storeHeaders: { headers: Record<string, string> }
      let realFetch: typeof global.fetch

      const openStore = async (email: string, name: string) => {
        const { seller } = await createSellerUser(appContainer, { email, name })
        const sellerService = appContainer.resolve(MercurModules.SELLER) as {
          updateSellers(data: { id: string; status: string }): Promise<unknown>
        }
        await sellerService.updateSellers({
          id: seller.id,
          status: SellerStatus.OPEN,
        })
        return seller
      }

      beforeAll(() => {
        appContainer = getContainer()
        process.env.FIREBASE_PROJECT_ID = PROJECT_ID
      })

      afterAll(() => {
        delete process.env.FIREBASE_PROJECT_ID
      })

      beforeEach(async () => {
        storeA = await openStore("scope-a@test.com", "Scope A")
        storeB = await openStore("scope-b@test.com", "Scope B")

        const apiKey = await generatePublishableKey(appContainer)
        storeHeaders = generateStoreHeaders({ publishableKey: apiKey })

        realFetch = global.fetch
        global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString()
          if (url.includes(CERTS_HOST)) {
            return new Response(JSON.stringify({ [KID]: publicKey }), {
              status: 200,
              headers: {
                "content-type": "application/json",
                "cache-control": "max-age=3600",
              },
            })
          }
          return realFetch(input, init)
        }) as typeof global.fetch
      })

      afterEach(() => {
        global.fetch = realFetch
      })

      const headersFor = (
        seller?: { handle: string },
        token?: string
      ): { headers: Record<string, string> } => ({
        headers: {
          ...storeHeaders.headers,
          ...(seller ? { "x-seller-handle": seller.handle } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      })

      const signInAt = async (
        phone: string,
        seller?: { handle: string }
      ): Promise<string> => {
        const res = await api.post(
          "/store/auth/firebase/verify",
          { id_token: signToken(phone) },
          headersFor(seller)
        )
        return res.data.token
      }

      it("serves the shopper on the store the session was minted at", async () => {
        const token = await signInAt("+15551250001", storeA)

        const res = await api.get(
          "/store/customers/me",
          headersFor(storeA, token)
        )

        expect(res.status).toEqual(200)
        expect(res.data.customer.phone).toBe("+15551250001")
      })

      it("refuses that session on another store", async () => {
        const token = await signInAt("+15551250002", storeA)

        const res = await api
          .get("/store/customers/me", headersFor(storeB, token))
          .catch((e) => e.response)

        expect(res.status).toEqual(401)
        expect(res.data.message).toMatch(/store/i)
      })

      it("refuses a session that predates store accounts", async () => {
        // No store header at sign-in => token carries no seller_id.
        const legacyToken = await signInAt("+15551250003")

        const res = await api
          .get("/store/customers/me", headersFor(storeA, legacyToken))
          .catch((e) => e.response)

        expect(res.status).toEqual(401)
      })

      it("leaves requests that name no store alone", async () => {
        const token = await signInAt("+15551250004", storeA)

        const res = await api.get(
          "/store/customers/me",
          headersFor(undefined, token)
        )

        expect(res.status).toEqual(200)
      })

      it("refuses another store's session on a cart request too", async () => {
        // Carts allow guests, so the session is optional there — the guard must
        // still catch a session that belongs elsewhere.
        const token = await signInAt("+15551250005", storeA)

        const res = await api
          .post("/store/carts", {}, headersFor(storeB, token))
          .catch((e) => e.response)

        expect(res.status).toEqual(401)
        expect(res.data.message).toMatch(/another store/i)
      })

      it("does not disturb guests (no session at all)", async () => {
        const res = await api
          .get("/store/customers/me", headersFor(storeA))
          .catch((e) => e.response)

        // Unauthenticated is Medusa's own 401 — not the store-scope refusal.
        expect(res.status).toEqual(401)
        expect(res.data.message ?? "").not.toMatch(/another store/i)
      })
    })
  },
})
