import { FieldPath, FieldValues, UseFormReturn } from "react-hook-form"

export interface TabDefinition<T extends FieldValues = FieldValues> {
  id: string
  labelKey: string
  label?: string
  validationFields?: FieldPath<T>[]
  isVisible?: (form: UseFormReturn<T>) => boolean
}

export const defineTabMeta = <T extends FieldValues = FieldValues>(
  meta: TabDefinition<T>
): TabDefinition<T> => {
  return meta
}
