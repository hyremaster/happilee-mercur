import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { HttpTypes } from "@medusajs/types"
import { Checkbox, Tooltip } from "@medusajs/ui"
import { ColumnDef } from "@tanstack/react-table"
import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import {
  createDataGridHelper,
  createDataGridPriceColumns,
  DataGrid,
} from "@components/data-grid"
import { DataGridMediaCell } from "../../../../components/data-grid/components/data-grid-media-cell"
import { useAttributes } from "../../../../hooks/api/attributes"
import { useStockLocations } from "@hooks/api/stock-locations"
import { ProductCreateVariantSchema } from "../constants"
import { ProductCreateSchemaType } from "../types"
import { decorateVariantsWithDefaultValues } from "../utils"
import {
  buildVariantAttributes,
  buildVariantsFromAttributes,
  getAttributeFormSliceKey,
  getOptionsSliceKey,
  getVariantStructureKey,
  haveSameVariantOptionStructure,
  type VariantAttribute,
} from "./variant-attribute-sync"

type MediaItem = {
  file?: File
  url?: string
  isThumbnail?: boolean
  id?: string
}

type ProductCreateVariantsFormProps = {
  form: UseFormReturn<ProductCreateSchemaType>
  store?: HttpTypes.AdminStore
  regions?: HttpTypes.AdminRegion[]
  pricePreferences?: HttpTypes.AdminPricePreference[]
  onOpenMediaModal?: (
    variantIndex: number,
    variantTitle?: string,
    initialMedia?: MediaItem[],
    productMedia?: MediaItem[]
  ) => void
  productMedia?: MediaItem[]
}

type VariantWithIndex = ProductCreateVariantSchema & {
  originalIndex: number
}

/**
 * NOTE: anything that goes to the DataGrid component needs to be memoised
 * otherwise DataGrid will rerender and inputs will lose focus.
 */
export const ProductCreateVariantsForm = ({
  form,
  store,
  regions = [],
  pricePreferences = [],
  onOpenMediaModal,
  productMedia = [],
}: ProductCreateVariantsFormProps) => {
  const { t } = useTranslation()
  const [searchValue, setSearchValue] = useState("")

  const variants = useWatch({
    control: form.control,
    name: "variants",
    defaultValue: [],
  })

  const options = useWatch({
    control: form.control,
    name: "options",
    defaultValue: [],
  })

  const attributesResult = useAttributes()
  const allAttributes = (attributesResult as { attributes?: unknown[] })
    .attributes

  const stableAttributes = useMemo(() => {
    return Array.isArray(allAttributes) ? allAttributes : []
  }, [allAttributes])

  const { stock_locations = [] } = useStockLocations({
    limit: 9999,
    fields: "id,name",
  })

  // Whole-form watch is only used to read attribute field values when the
  // attribute/option *structure* keys change — not on every price keystroke.
  const formValues = useWatch({
    control: form.control,
  }) as Record<string, unknown> | undefined

  const attributeSliceKey = useMemo(
    () => getAttributeFormSliceKey(formValues, stableAttributes),
    [formValues, stableAttributes]
  )

  const optionsSliceKey = useMemo(
    () => getOptionsSliceKey(options),
    [options]
  )

  const variantAttributes = useMemo(() => {
    return buildVariantAttributes(
      form.getValues() as Record<string, unknown>,
      stableAttributes,
      form.getValues("options") || []
    )
    // Rebuild only when attribute/option axes change — not when variants/prices change.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [attributeSliceKey, optionsSliceKey, stableAttributes, form])

  const variantStructureKey = useMemo(
    () => getVariantStructureKey(variantAttributes),
    [variantAttributes]
  )

  const variantAttributesRef = useRef(variantAttributes)
  variantAttributesRef.current = variantAttributes

  const hasProductMedia = productMedia.length > 0

  const columns = useColumns({
    variantAttributes,
    variantStructureKey,
    store,
    regions,
    pricePreferences,
    stockLocations: stock_locations,
    onOpenMediaModal,
    form,
    productMedia,
    hasProductMedia,
  })

  const variantData = useMemo(() => {
    const ret: VariantWithIndex[] = []

    if (variantAttributes.length > 0) {
      const built = buildVariantsFromAttributes(variantAttributes, variants)

      built.forEach((variant, i) => {
        const existingVariant = variants.find((v) => {
          if (!v.options) return false
          return variantAttributes.every(
            (attr) => v.options[attr.name] === variant.options[attr.name]
          )
        })

        ret.push({
          ...variant,
          prices: variant.prices as ProductCreateVariantSchema["prices"],
          media: variant.media as ProductCreateVariantSchema["media"],
          originalIndex: existingVariant
            ? variants.indexOf(existingVariant)
            : i,
        } as VariantWithIndex)
      })
    } else {
      variants.forEach((v, i) => {
        if (v.should_create) {
          ret.push({
            ...v,
            originalIndex: i,
          } as VariantWithIndex)
        }
      })
    }

    return ret
  }, [variants, variantAttributes])

  const filteredVariantData = useMemo(() => {
    if (!searchValue.trim()) return variantData

    return variantData.filter((variant) =>
      variant.title.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [variantData, searchValue])

  useEffect(() => {
    const attrs = variantAttributesRef.current

    if (attrs.length > 0) {
      const currentVariants = form.getValues("variants") || []
      const newVariants = buildVariantsFromAttributes(attrs, currentVariants)

      // Skip setValue when structure is unchanged — avoids DataGrid remount loop
      // that blocks price/media editing with multiple variants.
      if (haveSameVariantOptionStructure(currentVariants, newVariants)) {
        return
      }

      form.setValue("variants", newVariants as ProductCreateSchemaType["variants"])
      return
    }

    const currentVariants = form.getValues("variants") || []

    if (currentVariants.length === 0) {
      const defaultVariant = decorateVariantsWithDefaultValues([
        {
          title: "Default variant",
          should_create: true,
          variant_rank: 0,
          options: {},
          sku: "",
          prices: {},
          is_default: true,
          media: [],
        },
      ])

      form.setValue("variants", defaultVariant)
      return
    }

    const hasOnlyDefaultVariant =
      currentVariants.length === 1 && currentVariants[0].is_default
    if (!hasOnlyDefaultVariant) {
      const defaultVariant = decorateVariantsWithDefaultValues([
        {
          title: "Default variant",
          should_create: true,
          variant_rank: 0,
          options: {},
          sku: "",
          prices: {},
          is_default: true,
          media: [],
        },
      ])

      form.setValue("variants", defaultVariant)
    }
  }, [variantStructureKey, form])

  return (
    <div className="border-ui-border flex h-full flex-col justify-between divide-y">
      <DataGrid
        columns={columns}
        data={filteredVariantData}
        state={form}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t(
          "products.create.variants.productVariants.searchPlaceholder"
        )}
      />
    </div>
  )
}

const columnHelper = createDataGridHelper<
  VariantWithIndex,
  ProductCreateSchemaType
>()

const useColumns = ({
  variantAttributes = [],
  variantStructureKey,
  store,
  regions: _regions = [],
  pricePreferences = [],
  stockLocations: _stockLocations = [],
  onOpenMediaModal,
  form,
  productMedia = [],
  hasProductMedia = false,
}: {
  variantAttributes?: VariantAttribute[]
  variantStructureKey: string
  store?: HttpTypes.AdminStore
  regions?: HttpTypes.AdminRegion[]
  pricePreferences?: HttpTypes.AdminPricePreference[]
  stockLocations?: HttpTypes.AdminStockLocation[]
  onOpenMediaModal?: (
    variantIndex: number,
    variantTitle?: string,
    initialMedia?: MediaItem[],
    productMedia?: MediaItem[]
  ) => void
  form: UseFormReturn<ProductCreateSchemaType>
  productMedia?: MediaItem[]
  hasProductMedia?: boolean
}) => {
  const { t } = useTranslation()

  const variants = useWatch({
    control: form.control,
    name: "variants",
    defaultValue: [],
  })

  const variantsRef = useRef(variants)
  variantsRef.current = variants

  const productMediaRef = useRef(productMedia)
  productMediaRef.current = productMedia

  const onOpenMediaModalRef = useRef(onOpenMediaModal)
  onOpenMediaModalRef.current = onOpenMediaModal

  const allSelected =
    variants.length > 0 && variants.every((v) => v.should_create)
  const someSelected =
    variants.some((v) => v.should_create) && !allSelected

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      const currentVariants = form.getValues("variants") || []
      const updatedVariants = currentVariants.map((v) => ({
        ...v,
        should_create: checked,
      }))
      form.setValue("variants", updatedVariants)
    },
    [form]
  )

  return useMemo(
    () =>
      [
        columnHelper.column({
          id: "checkbox",
          header: () => (
            <Checkbox
              checked={
                allSelected
                  ? true
                  : someSelected
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={handleSelectAll}
            />
          ),
          field: (context) => {
            const rowData = context.row
              .original as VariantWithIndex
            return `variants.${rowData.originalIndex}.should_create`
          },
          type: "boolean",
          cell: (context) => (
            <DataGrid.BooleanCell context={context} />
          ),
          disableHiding: true,
          size: 52,
          pin: "left",
        }),
        columnHelper.column({
          id: "options_combined",
          name:
            variantAttributes.length > 0
              ? variantAttributes
                  .map((attr) => attr.name)
                  .join(" / ")
              : t("products.create.variants.optionsHeader"),
          header: () => {
            const label =
              variantAttributes.length > 0
                ? variantAttributes
                    .map((attr) => attr.name)
                    .join(" / ")
                : t("products.create.variants.optionsHeader")

            return (
              <Tooltip content={label}>
                <span className="w-full truncate">{label}</span>
              </Tooltip>
            )
          },
          cell: (context) => {
            if (variantAttributes.length === 0) {
              return (
                <DataGrid.ReadonlyCell context={context} />
              )
            }
            const rowData = context.row
              .original as VariantWithIndex
            const combinedValue = variantAttributes
              .map(
                (attr) => rowData.options?.[attr.name] || ""
              )
              .filter(Boolean)
              .join(" / ")

            return (
              <DataGrid.ReadonlyCell context={context}>
                {combinedValue}
              </DataGrid.ReadonlyCell>
            )
          },
          disableHiding: true,
          pin: "left",
        }),
        columnHelper.column({
          id: "title",
          name: t("fields.title"),
          header: t("fields.title"),
          field: (context) => {
            const rowData = context.row
              .original as VariantWithIndex
            return `variants.${rowData.originalIndex}.title`
          },
          type: "text",
          cell: (context) => (
            <DataGrid.TextCell context={context} />
          ),
          disableHiding: true,
          pin: "left",
        }),
        columnHelper.column({
          id: "media",
          name: t(
            "products.create.variants.productVariants.media"
          ),
          header: t(
            "products.create.variants.productVariants.media"
          ),
          field: (context) => {
            const rowData = context.row
              .original as VariantWithIndex
            return `variants.${rowData.originalIndex}.media`
          },
          type: "text",
          cell: (context) => {
            const rowData = context.row
              .original as VariantWithIndex

            return (
              <DataGridMediaCell
                context={context}
                disabled={!hasProductMedia}
                onOpenMediaModal={
                  hasProductMedia
                    ? () => {
                        const currentMedia =
                          variantsRef.current[
                            rowData.originalIndex
                          ]?.media
                        onOpenMediaModalRef.current?.(
                          rowData.originalIndex,
                          rowData.title,
                          currentMedia,
                          productMediaRef.current
                        )
                      }
                    : undefined
                }
              />
            )
          },
        }),
        columnHelper.column({
          id: "sku",
          name: t("fields.sku"),
          header: t("fields.sku"),
          field: (context) => {
            const rowData = context.row
              .original as VariantWithIndex
            return `variants.${rowData.originalIndex}.sku`
          },
          type: "text",
          cell: (context) => (
            <DataGrid.TextCell context={context} />
          ),
        }),
        ...createDataGridPriceColumns<
          VariantWithIndex,
          ProductCreateSchemaType
        >({
          currencies:
            store?.supported_currencies?.map(
              (c) => c.currency_code
            ) || [],
          pricePreferences,
          getFieldName: (context, value) => {
            const rowData = context.row
              .original as VariantWithIndex
            return `variants.${rowData.originalIndex}.prices.${value}`
          },
          t,
        }),
      ] as ColumnDef<VariantWithIndex>[],
    // Depend on structure key (stable string) instead of attribute array identity.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [
      variantStructureKey,
      t,
      store,
      pricePreferences,
      allSelected,
      someSelected,
      handleSelectAll,
      hasProductMedia,
    ]
  )
}
