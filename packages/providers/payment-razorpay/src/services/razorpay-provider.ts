import Razorpay from "razorpay"
import crypto from "crypto"
import { Pool } from "pg"
import { AbstractPaymentProvider, PaymentSessionStatus } from "@medusajs/framework/utils"
import type {
  InitiatePaymentInput,
  InitiatePaymentOutput,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  ProviderWebhookPayload,
  WebhookActionResult,
} from "@medusajs/framework/types"

type RazorpayCredentials = {
  key_id: string
  key_secret: string
  webhook_secret?: string
}

// Singleton pool — payment providers live as singletons, one pool is enough
let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("sslmode=no-verify")
        ? { rejectUnauthorized: false }
        : undefined,
      max: 3,
    })
  }
  return pool
}

export default class RazorpayProviderService extends AbstractPaymentProvider {
  static identifier = "razorpay"

  constructor(cradle: Record<string, any>, options: any) {
    super(cradle, options)
    // Do NOT access cradle keys here — payment module container is isolated
    // and does not have cross-module registrations (marketplace_profile etc.)
  }

  private async getCredentials(sellerId: string): Promise<RazorpayCredentials> {
    const { rows } = await getPool().query<{ credentials: RazorpayCredentials }>(
      `SELECT credentials FROM store_payment_gateway
       WHERE seller_id = $1 AND gateway = 'razorpay' AND is_active = true AND deleted_at IS NULL
       LIMIT 1`,
      [sellerId]
    )
    if (!rows[0]) {
      throw new Error(`No active Razorpay gateway configured for seller ${sellerId}`)
    }
    return rows[0].credentials
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const sellerId = input.data?.seller_id as string
    if (!sellerId) {
      throw new Error("seller_id is required in payment session data")
    }

    const { key_id, key_secret } = await this.getCredentials(sellerId)
    const razorpay = new Razorpay({ key_id, key_secret })

    const order = await (razorpay.orders as any).create({
      amount: Math.round(Number(input.amount) * 100),
      currency: input.currency_code.toUpperCase(),
      receipt: `rcpt_${Date.now()}`,
      notes: { seller_id: sellerId },
    })

    return {
      id: order.id,
      data: {
        order_id: order.id,
        key_id,
        amount: order.amount,
        currency: order.currency,
        seller_id: sellerId,
      },
    }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const data = input.data as Record<string, string>
    const { order_id, seller_id } = data

    const { key_id, key_secret } = await this.getCredentials(seller_id)
    const razorpay = new Razorpay({ key_id, key_secret })

    // Fetch payments for this order server-side — no client round-trip needed
    const payments = await (razorpay.orders as any).fetchPayments(order_id)
    const successfulPayment = (payments?.items ?? []).find(
      (p: any) => p.status === "captured" || p.status === "authorized"
    )

    if (successfulPayment) {
      return {
        status: PaymentSessionStatus.AUTHORIZED,
        data: { ...data, razorpay_payment_id: successfulPayment.id, authorized: "true" },
      }
    }

    return { status: PaymentSessionStatus.PENDING, data }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return { data: input.data }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  async deletePayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = input.data as Record<string, string>
    const { razorpay_payment_id, seller_id } = data

    const { key_id, key_secret } = await this.getCredentials(seller_id)
    const razorpay = new Razorpay({ key_id, key_secret })

    const refund = await (razorpay.payments as any).refund(razorpay_payment_id, {
      amount: Math.round(Number(input.amount) * 100),
    })

    return { data: { ...data, refund_id: refund.id } }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: input.data }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data: input.data }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const { authorized } = input.data as Record<string, string>
    return {
      status: authorized === "true"
        ? PaymentSessionStatus.AUTHORIZED
        : PaymentSessionStatus.PENDING,
    }
  }

  async getWebhookActionAndData(
    data: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    // Medusa wraps: { data: req.body, rawData: req.rawBody, headers: req.headers }
    const body = (data as any).data as Record<string, any>
    const rawData = (data as any).rawData
    const headers = (data as any).headers as Record<string, string>

    const event = body?.event as string
    const payment = body?.payload?.payment?.entity

    // Verify signature using vendor-specific webhook_secret from DB
    const sellerId = payment?.notes?.seller_id as string | undefined
    if (sellerId && rawData) {
      const creds = await this.getCredentials(sellerId).catch(() => null)
      if (creds?.webhook_secret) {
        const raw = Buffer.isBuffer(rawData)
          ? rawData
          : Buffer.from((rawData as any).data ?? rawData)
        const expected = crypto
          .createHmac("sha256", creds.webhook_secret)
          .update(raw)
          .digest("hex")
        if (expected !== headers["x-razorpay-signature"]) {
          return { action: "not_supported", data: { session_id: "", amount: 0 } }
        }
      }
    }

    const actionMap: Record<string, WebhookActionResult["action"]> = {
      "payment.authorized": "authorized",
      "payment.captured": "captured",
      "payment.failed": "failed",
    }

    return {
      action: actionMap[event] ?? "not_supported",
      data: {
        session_id: payment?.notes?.session_id,
        ...(payment?.amount ? { amount: payment.amount / 100 } : {}),
      },
    } as WebhookActionResult
  }
}
