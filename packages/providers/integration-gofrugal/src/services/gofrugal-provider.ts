import { MedusaError } from "@medusajs/framework/utils"
import type {
  IIntegrationProvider,
  IntegrationCategory,
  IntegrationConnectionInput,
  IntegrationProviderDefinition,
  IntegrationTestResult,
} from "@mercurjs/types"

export type GoFrugalProviderOptions = {
  /** Connection-test timeout in ms (default 20000). */
  timeout_ms?: number
}

type GoFrugalEdition = "hq" | "rpos" | "de"

type GoFrugalOutlet = { id: number; name?: string; status?: string }

type GoFrugalErrorBody = { error?: { code?: number | string; message?: string } }

const POS_ERP = "pos_erp" as IntegrationCategory

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

/**
 * GoFrugal POS/ERP (HQ, RPOS 6/7, Distribution Edition) via the GoFrugal
 * eCommerce API. Auth is the `X-Auth-Token` header.
 *
 * This provider only performs **read-only GET calls**. GoFrugal is the
 * merchant's production ERP; write calls (sales orders, customers) belong to
 * the order-sync work and must be explicitly opted into there.
 */
export class GoFrugalIntegrationProvider implements IIntegrationProvider {
  static identifier = "gofrugal"

  protected readonly options_: Required<GoFrugalProviderOptions>

  constructor(
    _container: Record<string, unknown>,
    options: GoFrugalProviderOptions = {}
  ) {
    this.options_ = { timeout_ms: options.timeout_ms ?? 20000 }
  }

  getDefinition(): IntegrationProviderDefinition {
    return {
      title: "GoFrugal",
      description:
        "Connect your GoFrugal POS / ERP to sync products, stock and prices, and to send online orders to your stores.",
      category: POS_ERP,
      docs_url: "https://help.connect.gofrugal.com/eCommerceAPI/",
      credential_fields: [
        {
          key: "base_url",
          label: "API base URL",
          type: "url",
          required: true,
          placeholder: "https://yourcompany.gofrugal.com/RayMedi_HQ",
          help_text:
            "Your GoFrugal domain plus the product path: /RayMedi_HQ for HQ, /WebReporter for RPOS or Distribution Edition.",
        },
        {
          key: "api_key",
          label: "API key (X-Auth-Token)",
          type: "secret",
          required: true,
          help_text:
            "HQ: Admin → Employee Details → employee with the Ecommerce role → Generate API Key. RPOS: WebReporter → API users.",
        },
      ],
      setting_fields: [
        {
          key: "edition",
          label: "GoFrugal edition",
          type: "select",
          required: true,
          default_value: "hq",
          options: [
            { value: "hq", label: "HQ (head office, multiple outlets)" },
            { value: "rpos", label: "RPOS 6 / RPOS 7 (single store)" },
            { value: "de", label: "Distribution Edition" },
          ],
        },
        {
          key: "company_data_context",
          label: "Company name (Distribution Edition only)",
          type: "text",
          required: false,
          help_text: "Sent as companyDataContext on every Distribution Edition call.",
        },
      ],
    }
  }

  async validate({ credentials, settings }: IntegrationConnectionInput) {
    const url = new URL(asString(credentials.base_url))
    if (url.search || url.hash) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "API base URL must not contain a query string or fragment."
      )
    }

    if (settings.edition === "de" && !asString(settings.company_data_context)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Company name is required for the Distribution Edition."
      )
    }
  }

  async testConnection({
    credentials,
    settings,
  }: IntegrationConnectionInput): Promise<IntegrationTestResult> {
    const edition = (asString(settings.edition) || "hq") as GoFrugalEdition
    const baseUrl = asString(credentials.base_url).replace(/\/+$/, "")
    const apiKey = asString(credentials.api_key)

    // HQ lists its outlets; other editions don't support eCommerceStores on
    // every version, so a one-row item read is used instead.
    const path =
      edition === "hq" ? "/api/v1/eCommerceStores" : "/api/v1/items?limit=1"
    const url = new URL(`${baseUrl}${path}`)
    if (edition === "de") {
      url.searchParams.set(
        "companyDataContext",
        asString(settings.company_data_context)
      )
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options_.timeout_ms)

    let response: Response
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Auth-Token": apiKey,
        },
        signal: controller.signal,
      })
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError"
      return {
        ok: false,
        message: aborted
          ? `GoFrugal did not respond within ${Math.round(this.options_.timeout_ms / 1000)}s.`
          : `Could not reach GoFrugal at ${url.host}. Check the API base URL.`,
      }
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message: `GoFrugal rejected the API key (HTTP ${response.status}).`,
      }
    }
    if (response.status === 404) {
      return {
        ok: false,
        message:
          "GoFrugal API not found at this URL (HTTP 404). Check the product path, e.g. /RayMedi_HQ or /WebReporter.",
      }
    }
    if (!response.ok) {
      return {
        ok: false,
        message: `GoFrugal returned an error (HTTP ${response.status}).`,
      }
    }

    const text = (await response.text()).trim()
    if (!text) {
      return {
        ok: false,
        message:
          "GoFrugal returned an empty response. This API may not be enabled for your edition; check the selected edition.",
      }
    }

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return {
        ok: false,
        message:
          "GoFrugal returned a non-JSON response. Check the API base URL and that the eCommerce API licence is active.",
      }
    }

    const apiError = (body as GoFrugalErrorBody).error
    if (apiError) {
      // 4410 = "No record available": authenticated, just nothing to list.
      if (String(apiError.code) === "4410") {
        return { ok: true, message: "Connected to GoFrugal (no records yet)." }
      }
      return {
        ok: false,
        message: `GoFrugal error ${apiError.code ?? ""}: ${apiError.message ?? "unknown error"}`.trim(),
      }
    }

    if (edition === "hq") {
      const outlets =
        (body as { eCommerceStores?: GoFrugalOutlet[] }).eCommerceStores ?? []
      return {
        ok: true,
        message: `Connected to GoFrugal HQ. ${outlets.length} outlet(s) found.`,
        details: {
          outlet_count: outlets.length,
          outlets: outlets.slice(0, 50).map((outlet) => ({
            id: outlet.id,
            name: outlet.name ?? null,
            status: outlet.status ?? null,
          })),
        },
      }
    }

    return { ok: true, message: "Connected to GoFrugal." }
  }
}
