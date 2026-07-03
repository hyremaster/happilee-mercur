import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { DEFAULT_STORE_ORDER_STATUSES } from "@mercurjs/types"

// GET /vendor/store-onboarding/default-statuses
// Returns the canonical order-status defaults used to seed new stores and
// power the "Reset to defaults" action in the UI.
export const GET = async (
  _req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  res.json({ order_statuses: DEFAULT_STORE_ORDER_STATUSES })
}
