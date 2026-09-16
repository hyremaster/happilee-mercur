import { createHash, randomInt, timingSafeEqual } from "crypto"

import { DAL } from "@medusajs/framework/types"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import type {
  CreateStoreOrderStatusDTO,
  StoreOrderStatusDTO,
  UpdateStoreOrderStatusDTO,
} from "@mercurjs/types"
import {
  StoreProfile,
  StoreOrderStatus,
  StoreOrderStatusEvent,
  OrderExtension,
  StorePaymentConfig,
  StoreLocationDetail,
  MemberProfile,
  StoreOnboardingDraft,
  StorefrontTemplate,
  StorePaymentGateway,
  StoreDeliveryArea,
  HappileeIdentityKey,
  PhoneOtp,
} from "./models"

type InjectedDependencies = {
  baseRepository: DAL.RepositoryService
}

type PhoneOtpRow = {
  id: string
  phone: string
  code_hash: string
  expires_at: Date | string
  attempts: number
  consumed_at: Date | string | null
  created_at: Date | string
}

// OTP policy.
const OTP_LENGTH = 6
const OTP_TTL_MS = 5 * 60 * 1000 // code valid 5 minutes
const OTP_MAX_ATTEMPTS = 5 // wrong tries before a code is burned
const OTP_RESEND_COOLDOWN_MS = 30 * 1000 // min gap between sends per phone

class MarketplaceProfileModuleService extends MedusaService({
  StoreProfile,
  StoreOrderStatus,
  StoreOrderStatusEvent,
  OrderExtension,
  StorePaymentConfig,
  StoreLocationDetail,
  MemberProfile,
  StoreOnboardingDraft,
  StorefrontTemplate,
  StorePaymentGateway,
  StoreDeliveryArea,
  HappileeIdentityKey,
  PhoneOtp,
}) {
  protected readonly baseRepository_: DAL.RepositoryService

  // MedusaService pluralizes model names at runtime via `pluralize`, which turns
  // "StoreOrderStatus" into the correct "...Statuses" methods. Its type-level
  // pluralizer, however, mistypes "Status" as already-plural and exposes
  // singular names. Re-declare the real (runtime) methods with correct types.
  declare createStoreOrderStatuses: (
    data: CreateStoreOrderStatusDTO | CreateStoreOrderStatusDTO[]
  ) => Promise<StoreOrderStatusDTO[]>
  declare listStoreOrderStatuses: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<StoreOrderStatusDTO[]>
  declare updateStoreOrderStatuses: (
    data: (UpdateStoreOrderStatusDTO & { id: string }) | (UpdateStoreOrderStatusDTO & { id: string })[]
  ) => Promise<StoreOrderStatusDTO[]>
  declare deleteStoreOrderStatuses: (ids: string | string[]) => Promise<void>

  constructor({ baseRepository }: InjectedDependencies) {
    // @ts-ignore
    // eslint-disable-next-line prefer-rest-params
    super(...arguments)
    this.baseRepository_ = baseRepository
  }

  // Salted, deterministic hash of an OTP code. The pepper keeps a DB dump from
  // being brute-forced offline; it is env-tunable and falls back to the JWT
  // secret so a default install still gets a non-empty salt.
  private hashOtpCode(phone: string, code: string): string {
    const pepper =
      process.env.PHONE_OTP_PEPPER || process.env.JWT_SECRET || "mercur-otp"
    return createHash("sha256").update(`${pepper}:${phone}:${code}`).digest("hex")
  }

  private asTime(v: Date | string | null): number {
    return v ? new Date(v).getTime() : 0
  }

  /**
   * Issue a fresh OTP for `phone`. Persists only the salted hash and returns the
   * plaintext `code` so the caller can deliver it (e.g. via WhatsApp). Throttled
   * per phone by {@link OTP_RESEND_COOLDOWN_MS}. Any earlier live codes for the
   * phone are invalidated so only the newest one works.
   */
  async requestPhoneOtp(phone: string): Promise<{ code: string; expires_at: Date }> {
    const now = Date.now()

    const existing = (await this.listPhoneOtps(
      { phone },
      { order: { created_at: "DESC" }, take: 1 }
    )) as unknown as PhoneOtpRow[]

    const last = existing[0]
    if (
      last &&
      !last.consumed_at &&
      now - this.asTime(last.created_at) < OTP_RESEND_COOLDOWN_MS
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "An OTP was just sent. Please wait a moment before requesting another."
      )
    }

    // Invalidate any still-live codes for this phone (single active code).
    const live = (await this.listPhoneOtps({
      phone,
      consumed_at: null,
    })) as unknown as PhoneOtpRow[]
    if (live.length) {
      await this.updatePhoneOtps(
        live.map((row) => ({ id: row.id, consumed_at: new Date(now) }))
      )
    }

    const code = randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, "0")
    const expires_at = new Date(now + OTP_TTL_MS)

    await this.createPhoneOtps({
      phone,
      code_hash: this.hashOtpCode(phone, code),
      expires_at,
      attempts: 0,
    })

    return { code, expires_at }
  }

  /**
   * Verify a submitted `code` for `phone`. Consumes the code on success. Counts
   * a wrong guess against {@link OTP_MAX_ATTEMPTS} and burns the code once the
   * cap is hit. Returns whether the code was valid.
   */
  async verifyPhoneOtp(phone: string, code: string): Promise<boolean> {
    const now = Date.now()

    const rows = (await this.listPhoneOtps(
      { phone, consumed_at: null },
      { order: { created_at: "DESC" }, take: 1 }
    )) as unknown as PhoneOtpRow[]

    const otp = rows[0]
    if (!otp) {
      return false
    }

    if (this.asTime(otp.expires_at) < now) {
      await this.updatePhoneOtps({ id: otp.id, consumed_at: new Date(now) })
      return false
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await this.updatePhoneOtps({ id: otp.id, consumed_at: new Date(now) })
      return false
    }

    const expected = Buffer.from(otp.code_hash)
    const actual = Buffer.from(this.hashOtpCode(phone, code))
    const matches =
      expected.length === actual.length && timingSafeEqual(expected, actual)

    if (!matches) {
      await this.updatePhoneOtps({ id: otp.id, attempts: otp.attempts + 1 })
      return false
    }

    await this.updatePhoneOtps({ id: otp.id, consumed_at: new Date(now) })
    return true
  }
}

export default MarketplaceProfileModuleService
