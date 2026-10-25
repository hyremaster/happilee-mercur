import { MedusaError } from "@medusajs/framework/utils"
import type {
  ExternalLocation,
  IIntegrationProvider,
  IntegrationCategory,
  IntegrationConnectionInput,
  IntegrationProviderDefinition,
  IntegrationTestResult,
} from "@mercurjs/types"

import { GoFrugalApiError, GoFrugalClient } from "../client/gofrugal-client"

export type GoFrugalProviderOptions = {
  /** Connection-test timeout in ms (default 20000). */
  timeout_ms?: number
}

type GoFrugalEdition = "hq" | "rpos" | "de"

type GoFrugalOutlet = {
  id: number
  name?: string
  shortName?: string
  location?: string
  address?: string
  status?: string
  erpCode?: string | null
}

type GoFrugalPage = {
  eCommerceStores?: GoFrugalOutlet[]
  total_pages?: number
}

const MAX_OUTLET_PAGES = 20

const EMPTY_RESPONSE_MESSAGE =
  "GoFrugal returned an empty response. This API may not be enabled for your edition; check the selected edition."

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

  async testConnection(
    input: IntegrationConnectionInput
  ): Promise<IntegrationTestResult> {
    const edition = this.edition(input)
    const client = this.client(input)

    try {
      if (edition === "hq") {
        const outlets = await this.fetchOutlets(client, input)
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

      // Not every RPOS / DE version lists outlets; one item read proves access.
      const response = await client.get("/api/v1/items", {
        limit: 1,
        ...this.companyContext(input),
      })
      if (response.kind === "empty_body") {
        return { ok: false, message: EMPTY_RESPONSE_MESSAGE }
      }
      return {
        ok: true,
        message:
          response.kind === "no_records"
            ? "Connected to GoFrugal (no records yet)."
            : "Connected to GoFrugal.",
      }
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Connection test failed.",
      }
    }
  }

  /**
   * GoFrugal outlets (`eCommerceStores`, all pages) as external locations.
   * Read-only. Throws GoFrugalApiError on failure.
   */
  async listLocations(input: IntegrationConnectionInput): Promise<ExternalLocation[]> {
    const outlets = await this.fetchOutlets(this.client(input), input)
    return outlets.map((outlet) => ({
      external_id: String(outlet.id),
      name: outlet.name?.trim() || `Outlet ${outlet.id}`,
      code: outlet.shortName?.trim() || null,
      address: outlet.address?.trim() || null,
      city: outlet.location?.trim() || null,
      is_active: (outlet.status ?? "active").toLowerCase() === "active",
      raw: outlet as Record<string, unknown>,
    }))
  }

  protected edition(input: IntegrationConnectionInput): GoFrugalEdition {
    return (asString(input.settings.edition) || "hq") as GoFrugalEdition
  }

  protected companyContext(input: IntegrationConnectionInput) {
    return this.edition(input) === "de"
      ? { companyDataContext: asString(input.settings.company_data_context) }
      : {}
  }

  protected client(input: IntegrationConnectionInput): GoFrugalClient {
    return new GoFrugalClient({
      base_url: asString(input.credentials.base_url),
      api_key: asString(input.credentials.api_key),
      timeout_ms: this.options_.timeout_ms,
    })
  }

  protected async fetchOutlets(
    client: GoFrugalClient,
    input: IntegrationConnectionInput
  ): Promise<GoFrugalOutlet[]> {
    const outlets: GoFrugalOutlet[] = []
    for (let page = 1; page <= MAX_OUTLET_PAGES; page++) {
      const response = await client.get<GoFrugalPage>("/api/v1/eCommerceStores", {
        page,
        ...this.companyContext(input),
      })
      if (response.kind === "empty_body") {
        throw new GoFrugalApiError(EMPTY_RESPONSE_MESSAGE, "invalid_response")
      }
      if (response.kind === "no_records") {
        break
      }
      outlets.push(...(response.body.eCommerceStores ?? []))
      const totalPages = Number(response.body.total_pages ?? 1)
      if (!Number.isFinite(totalPages) || page >= totalPages) {
        break
      }
    }
    return outlets
  }
}
