import { describe, expect, test } from "bun:test"

import {
  buildVariantAttributes,
  buildVariantsFromAttributes,
  getAttributeFormSliceKey,
  getOptionsSliceKey,
  getVariantStructureKey,
  haveSameVariantOptionStructure,
} from "../variant-attribute-sync"

const colorAttr = {
  handle: "color",
  name: "Color",
  ui_component: "multivalue",
  possible_values: [
    { id: "red", value: "Red" },
    { id: "blue", value: "Blue" },
  ],
}

describe("buildVariantAttributes", () => {
  test("builds attributes from selected multivalue values", () => {
    const result = buildVariantAttributes(
      {
        color: ["red", "blue"],
        colorUseForVariants: true,
      },
      [colorAttr]
    )

    expect(result).toEqual([
      {
        handle: "color",
        name: "Color",
        selectedValues: [
          { id: "red", value: "Red" },
          { id: "blue", value: "Blue" },
        ],
      },
    ])
  })

  test("skips attributes when useForVariants is false", () => {
    const result = buildVariantAttributes(
      {
        color: ["red"],
        colorUseForVariants: false,
      },
      [colorAttr]
    )

    expect(result).toEqual([])
  })

  test("includes product options marked for variants", () => {
    const result = buildVariantAttributes({}, [], [
      {
        title: "Size",
        values: ["S", "M"],
        useForVariants: true,
      },
    ])

    expect(result).toEqual([
      {
        handle: "option-Size",
        name: "Size",
        selectedValues: [
          { id: "S", value: "S" },
          { id: "M", value: "M" },
        ],
      },
    ])
  })
})

describe("variant structure sync", () => {
  test("structure key is stable for the same attribute axes", () => {
    const attrs = buildVariantAttributes(
      { color: ["red", "blue"], colorUseForVariants: true },
      [colorAttr]
    )

    expect(getVariantStructureKey(attrs)).toBe(
      "color:Color:red=Red,blue=Blue"
    )
    expect(getVariantStructureKey(attrs)).toBe(getVariantStructureKey(attrs))
  })

  test("attribute form slice ignores unrelated form fields like variants/prices", () => {
    const withPrices = getAttributeFormSliceKey(
      {
        color: ["red"],
        colorUseForVariants: true,
        variants: [{ prices: { usd: 10 } }],
        title: "Shirt",
      },
      [colorAttr]
    )
    const withoutPrices = getAttributeFormSliceKey(
      {
        color: ["red"],
        colorUseForVariants: true,
        variants: [{ prices: { usd: 99 } }],
        title: "Other",
      },
      [colorAttr]
    )

    expect(withPrices).toBe(withoutPrices)
  })

  test("options slice ignores non-option form noise", () => {
    expect(
      getOptionsSliceKey([
        { title: "Size", values: ["S", "M"], useForVariants: true },
      ])
    ).toBe("Size:true:S,M")
  })

  test("buildVariantsFromAttributes preserves existing prices by option match", () => {
    const attrs = buildVariantAttributes(
      { color: ["red", "blue"], colorUseForVariants: true },
      [colorAttr]
    )

    const built = buildVariantsFromAttributes(attrs, [
      {
        title: "Blue",
        options: { Color: "Blue" },
        prices: { usd: "20" },
        sku: "BLUE-1",
        should_create: true,
        media: [{ url: "blue.png", isThumbnail: true }],
      },
    ])

    expect(built).toHaveLength(2)
    expect(built[0]).toMatchObject({
      title: "Red",
      options: { Color: "Red" },
      prices: {},
      sku: "",
    })
    expect(built[1]).toMatchObject({
      title: "Blue",
      options: { Color: "Blue" },
      prices: { usd: "20" },
      sku: "BLUE-1",
      media: [{ url: "blue.png", isThumbnail: true }],
    })
  })

  test("haveSameVariantOptionStructure is true when combinations match in order", () => {
    const attrs = buildVariantAttributes(
      { color: ["red", "blue"], colorUseForVariants: true },
      [colorAttr]
    )
    const next = buildVariantsFromAttributes(attrs, [])
    const current = [
      {
        options: { Color: "Red" },
        prices: { usd: "5" },
      },
      {
        options: { Color: "Blue" },
        prices: { usd: "9" },
      },
    ]

    expect(haveSameVariantOptionStructure(current, next)).toBe(true)
  })

  test("haveSameVariantOptionStructure is false when a combination is added", () => {
    const attrs = buildVariantAttributes(
      { color: ["red", "blue"], colorUseForVariants: true },
      [colorAttr]
    )
    const next = buildVariantsFromAttributes(attrs, [])
    const current = [{ options: { Color: "Red" } }]

    expect(haveSameVariantOptionStructure(current, next)).toBe(false)
  })
})
