import { readFileSync } from "node:fs"

import { ExecArgs } from "@medusajs/framework/types"
import { IntegrationEligibilityRule, MercurModules } from "@mercurjs/types"

type IntegrationService = {
  applyEligibilityRule(
    scope: { seller_id: string; provider_id: string },
    rule?: IntegrationEligibilityRule
  ): Promise<{ evaluated: number; changed: number; eligible: number }>
}

/**
 * Sets a store's catalogue eligibility rule from a JSON file, or re-evaluates
 * staged items under the current rule (store rule, else the provider default)
 * when no file is given. Writes staging tables only; never calls the provider.
 * The rule is a compliance decision, so vendors can't change it in the panel.
 *
 *   bunx medusa exec ./src/scripts/integration-eligibility.ts <seller_id> [provider_id] [rule.json]
 */
export default async function integrationEligibility({ container, args }: ExecArgs) {
  const [sellerId, providerId = "gofrugal", ruleFile] = args ?? []
  if (!sellerId) {
    throw new Error(
      "Usage: medusa exec ./src/scripts/integration-eligibility.ts <seller_id> [provider_id] [rule.json]"
    )
  }

  const rule = ruleFile
    ? (JSON.parse(readFileSync(ruleFile, "utf8")) as IntegrationEligibilityRule)
    : undefined

  const service = container.resolve(MercurModules.INTEGRATION) as unknown as IntegrationService
  const result = await service.applyEligibilityRule(
    { seller_id: sellerId, provider_id: providerId },
    rule
  )

  process.stdout.write(
    `Evaluated ${result.evaluated} items: ${result.eligible} eligible, ${result.changed} changed.\n`
  )
}
