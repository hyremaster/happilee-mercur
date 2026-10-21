import { MedusaError } from "@medusajs/framework/utils"
import {
  IntegrationFieldDefinition,
  IntegrationValue,
  IntegrationValues,
} from "@mercurjs/types"

import { isMaskedSecret, maskSecret } from "../../../utils/secrets"

const isBlank = (value: IntegrationValue | undefined) =>
  value === undefined || value === null || value === ""

/**
 * Merge incoming values over stored ones. Only declared fields are kept.
 * A secret sent back masked (`••••…`) or omitted keeps its stored value, so a
 * client can resubmit a form it loaded without knowing the secrets.
 */
export function mergeFieldValues(
  fields: IntegrationFieldDefinition[],
  incoming: IntegrationValues | undefined,
  stored: IntegrationValues
): IntegrationValues {
  const result: IntegrationValues = {}

  for (const field of fields) {
    const hasIncoming = !!incoming && field.key in incoming
    const next = hasIncoming ? incoming[field.key] : undefined

    if (!hasIncoming) {
      if (field.key in stored) {
        result[field.key] = stored[field.key]
      } else if (field.default_value !== undefined) {
        result[field.key] = field.default_value
      }
      continue
    }

    if (field.type === "secret" && isMaskedSecret(next)) {
      if (field.key in stored) {
        result[field.key] = stored[field.key]
      }
      continue
    }

    result[field.key] =
      typeof next === "string" && field.type !== "secret" ? next.trim() : next ?? null
  }

  return result
}

/** Generic checks driven by the field descriptors (required, type, options). */
export function validateFieldValues(
  fields: IntegrationFieldDefinition[],
  values: IntegrationValues,
  scope: "credentials" | "settings"
): void {
  const errors: string[] = []

  for (const field of fields) {
    const value = values[field.key]

    if (isBlank(value)) {
      if (field.required) {
        errors.push(`${field.label} is required.`)
      }
      continue
    }

    switch (field.type) {
      case "text":
      case "secret":
        if (typeof value !== "string") {
          errors.push(`${field.label} must be text.`)
        }
        break
      case "url": {
        let ok = false
        if (typeof value === "string") {
          try {
            const url = new URL(value)
            ok = url.protocol === "https:" || url.protocol === "http:"
          } catch {
            ok = false
          }
        }
        if (!ok) {
          errors.push(`${field.label} must be a valid http(s) URL.`)
        }
        break
      }
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          errors.push(`${field.label} must be a number.`)
        }
        break
      case "boolean":
        if (typeof value !== "boolean") {
          errors.push(`${field.label} must be true or false.`)
        }
        break
      case "select":
        if (!field.options?.some((option) => option.value === value)) {
          errors.push(`${field.label} has an unsupported value.`)
        }
        break
    }
  }

  if (errors.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid integration ${scope}: ${errors.join(" ")}`
    )
  }
}

/** Mask `secret` fields; other credential fields (e.g. URLs) stay readable. */
export function maskCredentialValues(
  fields: IntegrationFieldDefinition[],
  values: IntegrationValues
): IntegrationValues {
  const masked: IntegrationValues = {}
  for (const field of fields) {
    if (!(field.key in values)) {
      continue
    }
    const value = values[field.key]
    masked[field.key] =
      field.type === "secret" && typeof value === "string" && value !== ""
        ? maskSecret(value)
        : value
  }
  return masked
}
