/**
 * Minimal GoFrugal eCommerce API client. **GET only**: GoFrugal is the
 * merchant's production ERP; write calls (sales orders, customers) are added
 * later behind an explicit opt-in.
 *
 * - Rate limit: requests to the same GoFrugal host are spaced to at most
 *   `max_rps` per second within this process (GoFrugal allows ≤ 5/s).
 * - Retries: network errors, timeouts, 5xx and 429, with exponential backoff
 *   and jitter. Other 4xx are not retried.
 * - Quirks: HTTP 200 with an empty body (endpoint unsupported on this
 *   edition) and `{"error":{"code":4410}}` (no records) are reported
 *   distinctly instead of as errors.
 * - The API key is never included in errors.
 */

export type GoFrugalClientOptions = {
  base_url: string
  api_key: string
  timeout_ms: number
  max_retries?: number
  max_rps?: number
}

export type GoFrugalResponse<T> =
  | { kind: "ok"; body: T }
  /** HTTP 200 with no body: the API isn't available on this edition/version. */
  | { kind: "empty_body" }
  /** GoFrugal error 4410 "No record available". */
  | { kind: "no_records" }

export type GoFrugalErrorReason =
  | "unauthorized"
  | "not_found"
  | "http_error"
  | "timeout"
  | "network"
  | "invalid_response"
  | "api_error"

export class GoFrugalApiError extends Error {
  constructor(
    message: string,
    readonly reason: GoFrugalErrorReason,
    readonly status?: number,
    readonly code?: string | number
  ) {
    super(message)
    this.name = "GoFrugalApiError"
  }
}

type GoFrugalErrorBody = { error?: { code?: number | string; message?: string } }

/** Next allowed request time per GoFrugal host, shared by all clients in the process. */
const nextSlotByHost = new Map<string, number>()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class GoFrugalClient {
  protected readonly baseUrl: string
  protected readonly host: string
  protected readonly options: Required<GoFrugalClientOptions>

  constructor(options: GoFrugalClientOptions) {
    this.options = { max_retries: 2, max_rps: 4, ...options }
    this.baseUrl = options.base_url.trim().replace(/\/+$/, "")
    this.host = new URL(this.baseUrl).host
  }

  async get<T>(
    path: string,
    query: Record<string, string | number | undefined> = {}
  ): Promise<GoFrugalResponse<T>> {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value))
      }
    }

    let attempt = 0
    for (;;) {
      try {
        return await this.request<T>(url)
      } catch (e) {
        const error = e instanceof GoFrugalApiError ? e : null
        const retryable =
          !!error &&
          (error.reason === "timeout" ||
            error.reason === "network" ||
            (error.reason === "http_error" &&
              (error.status === 429 || (error.status ?? 0) >= 500)))
        if (!retryable || attempt >= this.options.max_retries) {
          throw e
        }
        attempt++
        await sleep(500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250))
      }
    }
  }

  protected async throttle(): Promise<void> {
    const spacing = Math.ceil(1000 / this.options.max_rps)
    const now = Date.now()
    const slot = Math.max(now, nextSlotByHost.get(this.host) ?? 0)
    nextSlotByHost.set(this.host, slot + spacing)
    if (slot > now) {
      await sleep(slot - now)
    }
  }

  protected async request<T>(url: URL): Promise<GoFrugalResponse<T>> {
    await this.throttle()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options.timeout_ms)

    let response: Response
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Auth-Token": this.options.api_key,
        },
        signal: controller.signal,
      })
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError"
      throw aborted
        ? new GoFrugalApiError(
            `GoFrugal did not respond within ${Math.round(this.options.timeout_ms / 1000)}s.`,
            "timeout"
          )
        : new GoFrugalApiError(
            `Could not reach GoFrugal at ${this.host}. Check the API base URL.`,
            "network"
          )
    } finally {
      clearTimeout(timer)
    }

    if (response.status === 401 || response.status === 403) {
      throw new GoFrugalApiError(
        `GoFrugal rejected the API key (HTTP ${response.status}).`,
        "unauthorized",
        response.status
      )
    }
    if (response.status === 404) {
      throw new GoFrugalApiError(
        "GoFrugal API not found at this URL (HTTP 404). Check the product path, e.g. /RayMedi_HQ or /WebReporter.",
        "not_found",
        404
      )
    }
    if (!response.ok) {
      throw new GoFrugalApiError(
        `GoFrugal returned an error (HTTP ${response.status}).`,
        "http_error",
        response.status
      )
    }

    const text = (await response.text()).trim()
    if (!text) {
      return { kind: "empty_body" }
    }

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new GoFrugalApiError(
        "GoFrugal returned a non-JSON response. Check the API base URL and that the eCommerce API licence is active.",
        "invalid_response"
      )
    }

    const apiError = (body as GoFrugalErrorBody).error
    if (apiError) {
      if (String(apiError.code) === "4410") {
        return { kind: "no_records" }
      }
      throw new GoFrugalApiError(
        `GoFrugal error ${apiError.code ?? ""}: ${apiError.message ?? "unknown error"}`.trim(),
        "api_error",
        response.status,
        apiError.code
      )
    }

    return { kind: "ok", body: body as T }
  }
}
