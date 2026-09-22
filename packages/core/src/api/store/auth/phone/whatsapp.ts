import { MedusaError } from "@medusajs/framework/utils"

/**
 * Thin client for WhatsApp Cloud API (Meta Graph) used to deliver login OTPs.
 *
 * Env:
 *   WHATSAPP_PHONE_NUMBER_ID  — the sender's phone-number id (from Meta).
 *   WHATSAPP_ACCESS_TOKEN     — a permanent/system-user access token.
 *   WHATSAPP_OTP_TEMPLATE     — approved authentication template name (default "otp").
 *   WHATSAPP_TEMPLATE_LANG    — template language code (default "en_US").
 *   WHATSAPP_API_VERSION      — Graph API version (default "v21.0").
 *   WHATSAPP_OTP_BUTTON       — set "true" if the template has a copy-code URL
 *                               button that needs the code as its parameter.
 *
 * Business-initiated WhatsApp messages MUST use a pre-approved template, so the
 * OTP is passed as the template body parameter (and, optionally, the copy-code
 * button parameter).
 */

/** Digits only — WhatsApp `to` must be the full international number, no "+". */
const normalizeMsisdn = (phone: string): string => phone.replace(/[^\d]/g, "")

export function isWhatsappConfigured(): boolean {
  return !!(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN
  )
}

export async function sendWhatsappOtp(
  phone: string,
  code: string
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !token) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "WhatsApp is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN."
    )
  }

  const template = process.env.WHATSAPP_OTP_TEMPLATE || "otp"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
  const version = process.env.WHATSAPP_API_VERSION || "v21.0"

  const components: Record<string, unknown>[] = [
    {
      type: "body",
      parameters: [{ type: "text", text: code }],
    },
  ]

  // Authentication templates with a "copy code" button need the code echoed as
  // the button's URL parameter.
  if (process.env.WHATSAPP_OTP_BUTTON === "true") {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: code }],
    })
  }

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`

  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizeMsisdn(phone),
        type: "template",
        template: {
          name: template,
          language: { code: lang },
          components,
        },
      }),
    })
  } catch (e) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Failed to reach WhatsApp: ${(e as Error).message}`
    )
  }

  if (!response.ok) {
    let detail = ""
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      detail = body?.error?.message ? ` (${body.error.message})` : ""
    } catch {
      // ignore non-JSON error bodies
    }
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `WhatsApp returned ${response.status}.${detail}`
    )
  }
}
