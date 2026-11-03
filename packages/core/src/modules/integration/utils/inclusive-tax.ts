/** Provider rates are percentages; anything else can't be trusted. */
export const isValidTaxRate = (rate: number | null | undefined): rate is number =>
  typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate <= 100

/**
 * The tax inside a tax-inclusive amount, for display and for the provider's
 * order push (D-045). The customer pays the amount either way. 118 at 18% is 18.
 */
export function taxInsidePrice(amount: number, ratePercent: number): number {
  const tax = amount - amount / (1 + ratePercent / 100)
  return Math.round(tax * 100) / 100
}
