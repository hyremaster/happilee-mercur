import { MedusaError } from "@medusajs/framework/utils"

const MAX_VISIBLE_LENGTH = 500
const MAX_LOG_LENGTH = 2000

/** Shown for every failure that wasn't written for store users (database, bugs, ...). */
export const INTERNAL_SYNC_ERROR =
  "The sync failed because of a server error. Please try again later or contact support."

/**
 * A failure whose message was written for store users: a provider response or
 * a connection problem they can act on. Only these reach the vendor panel;
 * anything else is logged on the server and shown as INTERNAL_SYNC_ERROR.
 */
export class IntegrationSyncError extends MedusaError {}

const isSqlError = (message: string) =>
  /^\s*(with|select|insert|update|delete)\s/i.test(message)

/** A stored or provider message as the panel may show it. */
export function toVisibleIntegrationError(message: string): string {
  if (isSqlError(message)) {
    return INTERNAL_SYNC_ERROR
  }
  return message.length > MAX_VISIBLE_LENGTH
    ? `${message.slice(0, MAX_VISIBLE_LENGTH - 1)}…`
    : message
}

/** The message to store on a failed sync run. */
export function toSyncRunError(error: unknown): string {
  return error instanceof IntegrationSyncError
    ? toVisibleIntegrationError(error.message)
    : INTERNAL_SYNC_ERROR
}

/** Workflow steps can rethrow an error as a plain object. */
const messageOf = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === "string" ? message : String(error)
}

/**
 * The failure for server logs. Database errors arrive as "<SQL with its bound
 * rows> - <reason>", which can be hundreds of KB, so only the reason is kept.
 */
export function toSyncRunLogMessage(error: unknown): string {
  const message = messageOf(error)
  const separator = message.lastIndexOf(" - ")
  const reason =
    isSqlError(message) && separator !== -1 ? message.slice(separator + 3) : message
  return reason.slice(0, MAX_LOG_LENGTH)
}
