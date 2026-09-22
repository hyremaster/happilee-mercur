import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { isValidHandle, MedusaError } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import type SellerModuleService from "../../../../modules/seller/service"

// GET /vendor/store-onboarding/check-handle?handle=<value>
// Returns whether the given handle is available (not taken by any active seller).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const handle = req.query.handle as string | undefined

  if (!handle) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "handle query parameter is required"
    )
  }

  if (!isValidHandle(handle)) {
    return res.json({ available: false, handle, reason: "invalid_format" })
  }

  const sellerService = req.scope.resolve<SellerModuleService>(
    MercurModules.SELLER
  )

  const sellers = await sellerService.listSellers({ handle }, { take: 1 })

  res.json({ available: sellers.length === 0, handle })
}
