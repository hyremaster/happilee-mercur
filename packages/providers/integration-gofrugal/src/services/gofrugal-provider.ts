import { MedusaError } from "@medusajs/framework/utils"
import type {
  ExternalAttributes,
  ExternalItem,
  ExternalItemPrice,
  ExternalLocation,
  ExternalStockLevel,
  IIntegrationProvider,
  IntegrationCategory,
  IntegrationConnectionInput,
  IntegrationPage,
  IntegrationPageRequest,
  IntegrationProviderDefinition,
  IntegrationTestResult,
} from "@mercurjs/types"

import { GoFrugalApiError, GoFrugalClient } from "../client/gofrugal-client"

export type GoFrugalProviderOptions = {
  /** Connection-test timeout in ms (default 20000). */
  timeout_ms?: number
  /** Timeout per catalogue page in ms (default 90000; 1000-row item pages are large). */
  sync_timeout_ms?: number
  /** Rows per catalogue page (default 1000, GoFrugal's recommended maximum). */
  page_size?: number
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

type Scalar = string | number | boolean | null

/** One outlet row inside an item (`items[].stock[]`). */
type GoFrugalItemStock = Record<string, Scalar> & {
  outletId?: number | string
  itemReferenceCode?: string | number
  itemTimeStamp?: number | string
}

type GoFrugalItem = Record<string, Scalar | GoFrugalItemStock[] | undefined> & {
  itemId?: number | string
  itemName?: string
  stock?: GoFrugalItemStock[]
}

type GoFrugalPrice = Record<string, Scalar> & {
  itemReferenceCode?: string | number
  outletId?: number | string
  timestamp?: number | string
}

type GoFrugalBatchStock = Record<string, Scalar> & {
  itemId?: number | string
  outletId?: number | string
  stock?: number | string
  mrp?: number | string
}

type GoFrugalListPage = {
  items?: GoFrugalItem[]
  price?: GoFrugalPrice[]
  itemStockByBatchPrice?: GoFrugalBatchStock[]
  total_pages?: number | string
}

/** Item-level GoFrugal fields kept as attributes (profiling, eligibility rules later). */
const ITEM_ATTRIBUTE_FIELDS = [
  "itemProductType",
  "itemTaxType",
  "itemProductTaxType",
  "appliesOnline",
  "isReturnable",
  "isCancellable",
  "returnPeriod",
  "fulfilmentMode",
  "decimalsAllowed",
  "foodType",
]

/** Category fields live on each outlet row; the first non-empty value is used. */
const CATEGORY_FIELDS = ["Cat1", "Cat2", "Cat3", "Cat4", "Cat5", "Cat6", "Cat7", "Cat8", "Cat9", "Cat10"]

/** Outlet-row fields kept per location (prices come from the prices stream, D-010). */
const ITEM_LOCATION_ATTRIBUTE_FIELDS = [
  "packing",
  "minSaleQuantity",
  "variantName",
  "parentItemCode",
  "rack",
  "shelf",
  "box",
  "shelfLife",
]

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const toText = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }
  const s = String(value).trim()
  return s ? s : null
}

/** GoFrugal flags arrive as booleans, "Y"/"N" or "true"/"false". */
const toFlag = (value: unknown): boolean | null => {
  if (typeof value === "boolean") {
    return value
  }
  const s = toText(value)?.toLowerCase()
  if (s === "y" || s === "yes" || s === "true" || s === "1") {
    return true
  }
  if (s === "n" || s === "no" || s === "false" || s === "0") {
    return false
  }
  return null
}

const pick = (source: Record<string, unknown>, fields: string[]): ExternalAttributes => {
  const out: ExternalAttributes = {}
  for (const field of fields) {
    const value = source[field]
    if (value !== undefined && value !== null && value !== "") {
      out[field] = typeof value === "object" ? JSON.stringify(value) : (value as Scalar)
    }
  }
  return out
}

/** MRP as a stable lot key: "33.6" and "33.60" are the same lot. */
const lotKey = (mrp: unknown): string => {
  const n = toNumber(mrp)
  return n === null ? "unknown" : n.toFixed(2)
}

const maxOf = (current: string | null, value: unknown): string | null => {
  const n = toText(value)
  if (!n || !/^\d+$/.test(n)) {
    return current
  }
  return current === null || BigInt(n) > BigInt(current) ? n : current
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
 * Capabilities: locations (outlets), catalog (items), prices, stock (by MRP
 * batch). This provider only performs **read-only GET calls**. GoFrugal is the
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
    this.options_ = {
      timeout_ms: options.timeout_ms ?? 20000,
      sync_timeout_ms: options.sync_timeout_ms ?? 90000,
      page_size: options.page_size ?? 1000,
    }
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

  /**
   * Items changed since the cursor (`itemTimeStamp`, an incremental counter),
   * including items not flagged online (`selectAll=true`). Each GoFrugal item
   * carries one `stock[]` row per outlet; those become item locations. The
   * `stock`/`mrp` values on those rows are stale on HQ (D-010) and are kept
   * only in `raw`.
   */
  async listItems(
    input: IntegrationConnectionInput,
    request: IntegrationPageRequest
  ): Promise<IntegrationPage<ExternalItem>> {
    const body = await this.fetchListPage(input, "/api/v1/items", request.page, {
      selectAll: "true",
      q: request.cursor ? `itemTimeStamp>=${request.cursor}` : undefined,
    })
    if (!body) {
      return { rows: [], next_page: null, max_cursor: null }
    }

    let cursor: string | null = null
    const rows: ExternalItem[] = []
    for (const item of body.items ?? []) {
      const externalId = toText(item.itemId)
      if (!externalId) {
        continue
      }
      const outlets = Array.isArray(item.stock) ? item.stock : []
      const firstWith = (field: string) =>
        outlets.map((row) => row[field]).find((value) => toText(value) !== null) ?? null

      const categories: ExternalAttributes = {}
      for (const field of CATEGORY_FIELDS) {
        const value = toText(firstWith(field))
        if (value !== null) {
          categories[field] = value
        }
      }
      for (const row of outlets) {
        cursor = maxOf(cursor, row.itemTimeStamp)
      }

      const itemRaw = Object.fromEntries(
        Object.entries(item).filter(([key]) => key !== "stock")
      )
      rows.push({
        external_id: externalId,
        name: toText(item.itemName) ?? toText(item.shortName) ?? `Item ${externalId}`,
        sku: toText(firstWith("itemReferenceCode")),
        barcode: toText(firstWith("itemEANcode")),
        status: toText(item.status),
        manufacturer: toText(item.manufacturer),
        tax_rate: toNumber(firstWith("taxPercentage")),
        hsn_code: toText(firstWith("hsnCode")),
        attributes: { ...pick(item, ITEM_ATTRIBUTE_FIELDS), ...categories },
        raw: itemRaw,
        locations: outlets
          .filter((row) => toText(row.outletId) !== null)
          .map((row) => ({
            location_external_id: String(row.outletId),
            sku: toText(row.itemReferenceCode),
            is_online: toFlag(row.appliesOnline),
            buffer_qty: toNumber(row.bufferStock),
            special_price: toNumber(row.onlineSpecialPrice),
            attributes: pick(row, ITEM_LOCATION_ATTRIBUTE_FIELDS),
            raw: row as Record<string, unknown>,
          })),
      })
    }

    return { rows, next_page: this.nextPage(body, request.page), max_cursor: cursor }
  }

  /**
   * Per-outlet prices changed since the cursor (`timestamp`). GoFrugal keys
   * them by `itemReferenceCode`; staging resolves that to the item.
   */
  async listPrices(
    input: IntegrationConnectionInput,
    request: IntegrationPageRequest
  ): Promise<IntegrationPage<ExternalItemPrice>> {
    const body = await this.fetchListPage(input, "/api/v1/price", request.page, {
      q: request.cursor ? `timestamp>=${request.cursor}` : undefined,
    })
    if (!body) {
      return { rows: [], next_page: null, max_cursor: null }
    }

    let cursor: string | null = null
    const rows: ExternalItemPrice[] = []
    for (const price of body.price ?? []) {
      const sku = toText(price.itemReferenceCode)
      const outlet = toText(price.outletId)
      if (!sku || !outlet) {
        continue
      }
      cursor = maxOf(cursor, price.timestamp)
      rows.push({
        item_sku: sku,
        location_external_id: outlet,
        mrp: toNumber(price.mrp),
        sale_price: toNumber(price.salePrice),
        original_price: toNumber(price.originalPrice),
        tax_rate: toNumber(price.taxPercentage),
        raw: price as Record<string, unknown>,
      })
    }

    return { rows, next_page: this.nextPage(body, request.page), max_cursor: cursor }
  }

  /** Full snapshot of stock per item × outlet × MRP (D-010: the only reliable stock source on HQ). */
  async listStock(
    input: IntegrationConnectionInput,
    request: IntegrationPageRequest
  ): Promise<IntegrationPage<ExternalStockLevel>> {
    const body = await this.fetchListPage(
      input,
      "/api/v1/itemStockByBatchPrice",
      request.page,
      {}
    )
    if (!body) {
      return { rows: [], next_page: null, max_cursor: null }
    }

    const rows: ExternalStockLevel[] = []
    for (const level of body.itemStockByBatchPrice ?? []) {
      const item = toText(level.itemId)
      const outlet = toText(level.outletId)
      if (!item || !outlet) {
        continue
      }
      rows.push({
        item_external_id: item,
        location_external_id: outlet,
        lot_key: lotKey(level.mrp),
        quantity: toNumber(level.stock) ?? 0,
        mrp: toNumber(level.mrp),
        raw: level as Record<string, unknown>,
      })
    }

    return { rows, next_page: this.nextPage(body, request.page), max_cursor: null }
  }

  getCatalogProfileKeys(): string[] {
    return ["Cat6", "Cat4", "itemTaxType", "itemProductType", "appliesOnline", "Cat1"]
  }

  protected async fetchListPage(
    input: IntegrationConnectionInput,
    path: string,
    page: number,
    query: Record<string, string | undefined>
  ): Promise<GoFrugalListPage | null> {
    const response = await this.client(input, this.options_.sync_timeout_ms).get<GoFrugalListPage>(
      path,
      { page, limit: this.options_.page_size, ...query, ...this.companyContext(input) }
    )
    if (response.kind === "empty_body") {
      throw new GoFrugalApiError(EMPTY_RESPONSE_MESSAGE, "invalid_response")
    }
    return response.kind === "no_records" ? null : response.body
  }

  protected nextPage(body: GoFrugalListPage, page: number): number | null {
    const totalPages = Number(body.total_pages ?? 1)
    return Number.isFinite(totalPages) && page < totalPages ? page + 1 : null
  }

  protected edition(input: IntegrationConnectionInput): GoFrugalEdition {
    return (asString(input.settings.edition) || "hq") as GoFrugalEdition
  }

  protected companyContext(input: IntegrationConnectionInput) {
    return this.edition(input) === "de"
      ? { companyDataContext: asString(input.settings.company_data_context) }
      : {}
  }

  protected client(
    input: IntegrationConnectionInput,
    timeoutMs: number = this.options_.timeout_ms
  ): GoFrugalClient {
    return new GoFrugalClient({
      base_url: asString(input.credentials.base_url),
      api_key: asString(input.credentials.api_key),
      timeout_ms: timeoutMs,
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
