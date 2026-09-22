import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"

jest.setTimeout(60000)

// Pull the OTP code out of the mocked WhatsApp request body (the code is only
// ever sent to WhatsApp, never returned in the API response).
const codeFromFetchCall = (call: unknown[]): string => {
  const init = call[1] as RequestInit
  const body = JSON.parse(init.body as string)
  return body.template.components[0].parameters[0].text as string
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - Phone WhatsApp OTP auth", () => {
      let appContainer: MedusaContainer
      let storeHeaders: { headers: Record<string, string> }

      beforeAll(() => {
        appContainer = getContainer()
        process.env.WHATSAPP_PHONE_NUMBER_ID = "123456"
        process.env.WHATSAPP_ACCESS_TOKEN = "test-token"
      })

      afterAll(() => {
        delete process.env.WHATSAPP_PHONE_NUMBER_ID
        delete process.env.WHATSAPP_ACCESS_TOKEN
      })

      afterEach(() => {
        jest.restoreAllMocks()
      })

      const mockWhatsapp = () =>
        jest.spyOn(global, "fetch").mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: "wamid.test" }] }),
        } as Response)

      beforeEach(async () => {
        const apiKey = await generatePublishableKey(appContainer)
        storeHeaders = generateStoreHeaders({ publishableKey: apiKey })
      })

      const sendOtp = (phone: string) =>
        api
          .post(`/store/auth/phone/send-otp`, { phone }, storeHeaders)
          .catch((e) => e.response)

      const verifyOtp = (phone: string, otp: string) =>
        api
          .post(`/store/auth/phone/verify-otp`, { phone, otp }, storeHeaders)
          .catch((e) => e.response)

      it("registers a new customer via OTP and returns a usable token", async () => {
        const phone = "+919000000001"
        const spy = mockWhatsapp()

        const send = await sendOtp(phone)
        expect(send.status).toEqual(200)
        expect(send.data.status).toEqual("sent")
        expect(spy).toHaveBeenCalled()

        const code = codeFromFetchCall(spy.mock.calls[0])

        const verify = await verifyOtp(phone, code)
        expect(verify.status).toEqual(200)
        expect(typeof verify.data.token).toEqual("string")

        // Token authenticates the new customer, whose phone is set.
        const me = await api.get(`/store/customers/me`, {
          headers: {
            ...storeHeaders.headers,
            authorization: `Bearer ${verify.data.token}`,
          },
        })
        expect(me.status).toEqual(200)
        expect(me.data.customer.phone).toEqual(phone)
      })

      it("logs the same customer in on a second OTP round (same customer id)", async () => {
        const phone = "+919000000002"

        const spy1 = mockWhatsapp()
        await sendOtp(phone)
        const verify1 = await verifyOtp(phone, codeFromFetchCall(spy1.mock.calls[0]))
        jest.restoreAllMocks()

        const spy2 = mockWhatsapp()
        await sendOtp(phone)
        const verify2 = await verifyOtp(phone, codeFromFetchCall(spy2.mock.calls[0]))

        const me1 = await api.get(`/store/customers/me`, {
          headers: {
            ...storeHeaders.headers,
            authorization: `Bearer ${verify1.data.token}`,
          },
        })
        const me2 = await api.get(`/store/customers/me`, {
          headers: {
            ...storeHeaders.headers,
            authorization: `Bearer ${verify2.data.token}`,
          },
        })
        expect(me2.data.customer.id).toEqual(me1.data.customer.id)
      })

      it("rejects a wrong OTP", async () => {
        const phone = "+919000000003"
        mockWhatsapp()
        await sendOtp(phone)

        const verify = await verifyOtp(phone, "000000")
        expect(verify.status).toEqual(401)
      })

      it("rejects reuse of a consumed OTP", async () => {
        const phone = "+919000000004"
        const spy = mockWhatsapp()
        await sendOtp(phone)
        const code = codeFromFetchCall(spy.mock.calls[0])

        const first = await verifyOtp(phone, code)
        expect(first.status).toEqual(200)

        const second = await verifyOtp(phone, code)
        expect(second.status).toEqual(401)
      })

      it("throttles an immediate resend", async () => {
        const phone = "+919000000005"
        mockWhatsapp()

        const first = await sendOtp(phone)
        expect(first.status).toEqual(200)

        const second = await sendOtp(phone)
        expect(second.status).toBeGreaterThanOrEqual(400)
      })

      it("rejects an invalid phone number", async () => {
        const res = await sendOtp("not-a-phone")
        expect(res.status).toEqual(400)
      })
    })
  },
})
