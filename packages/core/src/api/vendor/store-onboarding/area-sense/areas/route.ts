import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"

import { fetchAreaSenseAreas } from "../client"

// GET /vendor/store-onboarding/area-sense/areas — proxy the external Area Sense
// OpenAPI to populate the "Delivery available areas" dropdown (wizard step 2).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const search =
    typeof req.query.search === "string" ? req.query.search : undefined
  const areas = await fetchAreaSenseAreas({ search })
  res.json({ areas })
}
