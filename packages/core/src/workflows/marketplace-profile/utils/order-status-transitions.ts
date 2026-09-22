import { MedusaError } from "@medusajs/framework/utils"
import {
  StoreOrderStatusType,
  TERMINAL_STORE_ORDER_STATUSES,
} from "@mercurjs/types"

type RankedStatus = { status: string; rank: number }

const isTerminal = (status: string): boolean =>
  TERMINAL_STORE_ORDER_STATUSES.includes(status as StoreOrderStatusType)

/**
 * Sequential-progression rule for a store's order statuses.
 *
 * Given the store's *active* statuses (rank-ordered) and the order's current
 * status, the only valid moves are:
 *   - advance to the immediate next active status by rank, and
 *   - `cancelled` (when cancelled is an active status).
 * Terminal statuses (`delivered`, `cancelled`) allow no further transition.
 */
export function getAllowedNextStatuses(
  activeStatuses: RankedStatus[],
  current: string
): StoreOrderStatusType[] {
  if (isTerminal(current)) {
    return []
  }

  const sorted = [...activeStatuses].sort((a, b) => a.rank - b.rank)
  const sequence = sorted.filter(
    (s) => s.status !== StoreOrderStatusType.CANCELLED
  )

  const allowed: StoreOrderStatusType[] = []

  const currentIdx = sequence.findIndex((s) => s.status === current)
  const next = currentIdx >= 0 ? sequence[currentIdx + 1] : undefined
  if (next) {
    allowed.push(next.status as StoreOrderStatusType)
  }

  const cancellable = activeStatuses.some(
    (s) => s.status === StoreOrderStatusType.CANCELLED
  )
  if (cancellable) {
    allowed.push(StoreOrderStatusType.CANCELLED)
  }

  return allowed
}

/**
 * Throws MedusaError(NOT_ALLOWED) when `target` is not a valid next status for
 * `current` given the store's active status configuration.
 */
export function assertTransitionAllowed(
  activeStatuses: RankedStatus[],
  current: string,
  target: string
): void {
  const allowed = getAllowedNextStatuses(activeStatuses, current)
  if (!allowed.includes(target as StoreOrderStatusType)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Cannot change order status from "${current}" to "${target}". Allowed: ${
        allowed.length ? allowed.join(", ") : "none (terminal status)"
      }.`
    )
  }
}
