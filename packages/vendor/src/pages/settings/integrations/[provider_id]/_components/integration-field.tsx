import { Input, Select, Switch } from "@medusajs/ui"
import { IntegrationFieldDefinition } from "@mercurjs/types"
import { Control, FieldPath } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "@components/common/form"

export type IntegrationFormValue = string | boolean

export type IntegrationFormValues = {
  is_enabled: boolean
  credentials: Record<string, IntegrationFormValue>
  settings: Record<string, IntegrationFormValue>
}

type IntegrationFieldProps = {
  control: Control<IntegrationFormValues>
  name: FieldPath<IntegrationFormValues>
  field: IntegrationFieldDefinition
  /** Masked stored secret (e.g. `••••a1b2`); blank input keeps it. */
  storedSecret: string | null
}

/** Renders one provider-described field (text, url, secret, number, boolean, select). */
export const IntegrationField = ({
  control,
  name,
  field: definition,
  storedSecret,
}: IntegrationFieldProps) => {
  const { t } = useTranslation()
  const optional = !definition.required && definition.type !== "boolean"
  const hint = storedSecret
    ? t("integrations.form.secretKeep", { masked: storedSecret })
    : definition.help_text

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field: { value, onChange, ref, ...field } }) => {
        if (definition.type === "boolean") {
          return (
            <Form.Item>
              <div className="flex items-start justify-between gap-x-4">
                <Form.Label>{definition.label}</Form.Label>
                <Form.Control>
                  <Switch
                    {...field}
                    ref={ref}
                    checked={Boolean(value)}
                    onCheckedChange={onChange}
                  />
                </Form.Control>
              </div>
              {hint && <Form.Hint>{hint}</Form.Hint>}
              <Form.ErrorMessage />
            </Form.Item>
          )
        }

        if (definition.type === "select") {
          return (
            <Form.Item>
              <Form.Label optional={optional}>{definition.label}</Form.Label>
              <Form.Control>
                <Select
                  {...field}
                  value={typeof value === "string" ? value : ""}
                  onValueChange={onChange}
                >
                  <Select.Trigger ref={ref}>
                    <Select.Value placeholder={definition.placeholder} />
                  </Select.Trigger>
                  <Select.Content>
                    {(definition.options ?? []).map((option) => (
                      <Select.Item key={option.value} value={option.value}>
                        {option.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Form.Control>
              {hint && <Form.Hint>{hint}</Form.Hint>}
              <Form.ErrorMessage />
            </Form.Item>
          )
        }

        const inputType =
          definition.type === "secret"
            ? "password"
            : definition.type === "number"
              ? "number"
              : definition.type === "url"
                ? "url"
                : "text"

        return (
          <Form.Item>
            <Form.Label optional={optional}>{definition.label}</Form.Label>
            <Form.Control>
              <Input
                {...field}
                ref={ref}
                type={inputType}
                autoComplete={definition.type === "secret" ? "new-password" : "off"}
                placeholder={storedSecret ?? definition.placeholder}
                value={typeof value === "string" ? value : ""}
                onChange={onChange}
              />
            </Form.Control>
            {hint && <Form.Hint>{hint}</Form.Hint>}
            <Form.ErrorMessage />
          </Form.Item>
        )
      }}
    />
  )
}
