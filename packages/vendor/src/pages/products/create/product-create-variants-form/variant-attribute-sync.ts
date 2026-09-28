export type VariantAttributeValue = {
  id: string
  value: string
}

export type VariantAttribute = {
  handle: string
  name: string
  selectedValues: VariantAttributeValue[]
}

type AttributeLike = {
  handle?: string
  name?: string
  ui_component?: string
  possible_values?: Array<{ id: string; value: string }>
}

type OptionLike = {
  title?: string
  values?: string[]
  useForVariants?: boolean
}

type VariantLike = {
  title?: string
  should_create?: boolean
  variant_rank?: number
  options?: Record<string, string>
  sku?: string
  prices?: Record<string, unknown>
  is_default?: boolean
  media?: unknown[]
}

/**
 * Builds the attribute/option axes used to generate variant combinations.
 * Only multivalue attributes marked for variants (or with selected values) are included.
 */
export const buildVariantAttributes = (
  formValues: Record<string, unknown> | null | undefined,
  allAttributes: AttributeLike[],
  options: OptionLike[] = []
): VariantAttribute[] => {
  const result: VariantAttribute[] = []
  const values = formValues ?? {}

  allAttributes.forEach((attr) => {
    if (attr.ui_component !== "multivalue" || !attr.handle || !attr.name) {
      return
    }

    const useForVariants = values[`${attr.handle}UseForVariants`]
    if (useForVariants === false) {
      return
    }

    const selectedValueIds = values[attr.handle]
    if (
      !selectedValueIds ||
      !Array.isArray(selectedValueIds) ||
      selectedValueIds.length === 0
    ) {
      return
    }

    const selectedValues = selectedValueIds
      .map((valueId: unknown) => {
        if (typeof valueId !== "string") {
          return null
        }
        const possibleValue = attr.possible_values?.find(
          (pv) => pv.id === valueId
        )
        return possibleValue
          ? { id: valueId, value: possibleValue.value }
          : null
      })
      .filter((item): item is VariantAttributeValue => item !== null)

    if (selectedValues.length > 0) {
      result.push({
        handle: attr.handle,
        name: attr.name,
        selectedValues,
      })
    }
  })

  options.forEach((option) => {
    if (
      option?.useForVariants === false ||
      !option?.title ||
      !option?.values ||
      !Array.isArray(option.values) ||
      option.values.length === 0
    ) {
      return
    }

    result.push({
      handle: `option-${option.title}`,
      name: option.title,
      selectedValues: option.values.map((value: string) => ({
        id: value,
        value,
      })),
    })
  })

  return result
}

/** Stable key for attribute/option combination structure (ids only). */
export const getVariantStructureKey = (
  variantAttributes: VariantAttribute[]
): string => {
  return variantAttributes
    .map(
      (attr) =>
        `${attr.handle}:${attr.name}:${attr.selectedValues
          .map((v) => `${v.id}=${v.value}`)
          .join(",")}`
    )
    .join("|")
}

/** Slice of form values that affect variant attribute axes (excludes variants/prices). */
export const getAttributeFormSliceKey = (
  formValues: Record<string, unknown> | null | undefined,
  allAttributes: AttributeLike[]
): string => {
  const values = formValues ?? {}

  return allAttributes
    .filter((attr) => attr.ui_component === "multivalue" && attr.handle)
    .map((attr) => {
      const handle = attr.handle as string
      const selected = values[handle]
      const useForVariants = values[`${handle}UseForVariants`]
      const selectedKey = Array.isArray(selected)
        ? selected.map(String).join(",")
        : ""
      return `${handle}:${String(useForVariants)}:${selectedKey}`
    })
    .join("|")
}

export const getOptionsSliceKey = (options: OptionLike[] | undefined): string => {
  return (options ?? [])
    .map(
      (option) =>
        `${option?.title ?? ""}:${String(option?.useForVariants)}:${(
          option?.values ?? []
        ).join(",")}`
    )
    .join("|")
}

const getCombinationOptions = (
  variantAttributes: VariantAttribute[],
  combinationIndex: number
): Record<string, string> => {
  const variantOptions: Record<string, string> = {}

  variantAttributes.forEach((attr) => {
    let valueIndex = 0
    let divisor = 1

    for (let j = variantAttributes.length - 1; j >= 0; j--) {
      if (variantAttributes[j].handle === attr.handle) {
        valueIndex =
          Math.floor(combinationIndex / divisor) % attr.selectedValues.length
        break
      }
      divisor *= variantAttributes[j].selectedValues.length
    }

    variantOptions[attr.name] = attr.selectedValues[valueIndex]?.value || ""
  })

  return variantOptions
}

const findMatchingVariant = <T extends VariantLike>(
  variants: T[],
  variantAttributes: VariantAttribute[],
  variantOptions: Record<string, string>
): T | undefined => {
  return variants.find((variant) => {
    if (!variant.options) {
      return false
    }
    return variantAttributes.every(
      (attr) => variant.options?.[attr.name] === variantOptions[attr.name]
    )
  })
}

export const buildVariantsFromAttributes = <T extends VariantLike>(
  variantAttributes: VariantAttribute[],
  currentVariants: T[]
): Array<{
  title: string
  should_create: boolean
  variant_rank: number
  options: Record<string, string>
  sku: string
  prices: Record<string, unknown>
  is_default: boolean
  media: unknown[]
}> => {
  const totalCombinations = variantAttributes.reduce(
    (acc, attr) => acc * attr.selectedValues.length,
    1
  )
  const newVariants: Array<{
    title: string
    should_create: boolean
    variant_rank: number
    options: Record<string, string>
    sku: string
    prices: Record<string, unknown>
    is_default: boolean
    media: unknown[]
  }> = []

  for (let i = 0; i < totalCombinations; i++) {
    const variantOptions = getCombinationOptions(variantAttributes, i)
    const autoTitle = variantAttributes
      .map((attr) => variantOptions[attr.name])
      .filter(Boolean)
      .join(" / ")

    const existingVariant = findMatchingVariant(
      currentVariants,
      variantAttributes,
      variantOptions
    )

    newVariants.push({
      title: autoTitle,
      should_create: existingVariant?.should_create ?? true,
      variant_rank: i,
      options: variantOptions,
      sku: existingVariant?.sku || "",
      prices: existingVariant?.prices || {},
      is_default: i === 0,
      media: existingVariant?.media || [],
    })
  }

  return newVariants
}

/** True when current variants already match the generated option combinations in order. */
export const haveSameVariantOptionStructure = (
  currentVariants: VariantLike[],
  nextVariants: VariantLike[]
): boolean => {
  if (currentVariants.length !== nextVariants.length) {
    return false
  }

  return nextVariants.every((next, index) => {
    const current = currentVariants[index]
    if (!current?.options || !next.options) {
      return false
    }

    const nextKeys = Object.keys(next.options)
    const currentKeys = Object.keys(current.options)
    if (nextKeys.length !== currentKeys.length) {
      return false
    }

    return nextKeys.every(
      (key) => current.options?.[key] === next.options?.[key]
    )
  })
}
