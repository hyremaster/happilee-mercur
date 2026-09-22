import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ICustomerModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
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

const signToken = (phone: string, uid = "firebase-uid-1") =>
  jwt.sign(
    { phone_number: phone, firebase: { sign_in_provider: "phone" } },
    privateKey,
    {
      algorithm: "RS256",
      keyid: KID,
      subject: uid,
      audience: PROJECT_ID,
      issuer: ISSUER,
      expiresIn: "1h",
    }
  )

const decode = (token: string) =>
  jwt.decode(token) as {
    actor_id: string
    app_metadata: { customer_id: string; seller_id?: string }
  }

/**
 * Phase 2 of store-scoped customers (docs/store-scoped-customers.md): a phone
 * number gets one customer PER STORE, and the session says which store it is
 * for. Requests without a store header keep the old marketplace-wide behaviour
 * until the storefront sends one.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - store-scoped customer accounts", () => {
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
        storeA = await openStore("store-a@test.com", "Store A")
        storeB = await openStore("store-b@test.com", "Store B")

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

      const atStore = (seller: { handle: string }) => ({
        headers: { ...storeHeaders.headers, "x-seller-handle": seller.handle },
      })

      const signIn = (phone: string, seller?: { handle: string }, body = {}) =>
        api.post(
          "/store/auth/firebase/verify",
          { id_token: signToken(phone), ...body },
          seller ? atStore(seller) : storeHeaders
        )

      const customerService = () =>
        appContainer.resolve<ICustomerModuleService>(Modules.CUSTOMER)

      it("gives the same phone a separate customer in each store", async () => {
        const phone = "+15551240001"

        const atA = decode((await signIn(phone, storeA)).data.token)
        const atB = decode((await signIn(phone, storeB)).data.token)

        expect(atA.app_metadata.customer_id).not.toEqual(
          atB.app_metadata.customer_id
        )
        expect(atA.app_metadata.seller_id).toBe(storeA.id)
        expect(atB.app_metadata.seller_id).toBe(storeB.id)

        // Both accounts carry the phone; their login emails differ per store.
        const a = await customerService().retrieveCustomer(atA.actor_id)
        const b = await customerService().retrieveCustomer(atB.actor_id)
        expect(a.phone).toBe(phone)
        expect(b.phone).toBe(phone)
        expect(a.email).not.toEqual(b.email)
        expect(a.email).toContain(storeA.handle)
        expect(b.email).toContain(storeB.handle)
      })

      it("reuses that store's customer when the shopper signs in again", async () => {
        const phone = "+15551240002"

        const first = decode((await signIn(phone, storeA)).data.token)
        const second = decode((await signIn(phone, storeA)).data.token)

        expect(first.app_metadata.customer_id).toEqual(
          second.app_metadata.customer_id
        )
      })

      it("links the shopper to the store at sign-in, before any order", async () => {
        const phone = "+15551240003"
        const { actor_id } = decode((await signIn(phone, storeA)).data.token)

        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data: links } = await query.graph({
          entity: "seller_customer",
          fields: ["seller_id", "customer_id"],
          filters: { customer_id: actor_id },
        })

        expect(links).toHaveLength(1)
        expect(links[0].seller_id).toBe(storeA.id)
      })

      it("keeps a shopper-supplied email as contact detail, not as the login email", async () => {
        const phone = "+15551240004"
        const res = await signIn(phone, storeA, { email: "shopper@real.com" })
        const customer = await customerService().retrieveCustomer(
          decode(res.data.token).actor_id
        )

        // A real address can't be the login email: (email, has_account) is
        // unique, so the same shopper could not then sign in at a second store.
        expect(customer.email).toContain(storeA.handle)
        expect(customer.metadata?.contact_email).toBe("shopper@real.com")
      })

      it("answers the exists check per store", async () => {
        const phone = "+15551240005"
        await signIn(phone, storeA)

        const inA = await api.post(
          "/store/auth/phone/exists",
          { phone },
          atStore(storeA)
        )
        const inB = await api.post(
          "/store/auth/phone/exists",
          { phone },
          atStore(storeB)
        )

        expect(inA.data.exists).toBe(true)
        expect(inB.data.exists).toBe(false)
      })

      it("keeps marketplace-wide behaviour when no store header is sent", async () => {
        const phone = "+15551240006"

        const first = decode((await signIn(phone)).data.token)
        const second = decode((await signIn(phone)).data.token)

        expect(first.app_metadata.customer_id).toEqual(
          second.app_metadata.customer_id
        )
        expect(first.app_metadata.seller_id).toBeUndefined()

        const exists = await api.post(
          "/store/auth/phone/exists",
          { phone },
          storeHeaders
        )
        expect(exists.data.exists).toBe(true)
      })
    })
  },
})
