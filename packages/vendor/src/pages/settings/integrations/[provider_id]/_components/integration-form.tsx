import { zodResolver } from "@hookform/resolvers/zod"
import { Alert, Button, Text, toast, usePrompt } from "@medusajs/ui"
import {
  IntegrationFieldDefinition,
  IntegrationTestResult,
  IntegrationValues,
  StoreIntegrationDTO,
  StoreIntegrationListItem,
  StoreIntegrationStatus,
} from "@mercurjs/types"
import { TFunction } from "i18next"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { RouteDrawer, useRouteModal } from "@components/modals"
import { KeyboundForm } from "@components/utilities/keybound-form"
import {
  useDeleteIntegration,
  useSaveIntegration,
  useTestIntegration,
} from "@hooks/api/integrations"

import {
  IntegrationField,
  IntegrationFormValue,
  IntegrationFormValues,
} from "./integration-field"

type IntegrationFormProps = {
  integration: StoreIntegrationListItem
}

type FieldValues = Record<string, IntegrationFormValue>

const NO_FIELDS: IntegrationFieldDefinition[] = []

type FormValues = IntegrationFormValues

const storedSecret = (
  connection: StoreIntegrationDTO | null,
  field: IntegrationFieldDefinition
) => {
  const value = connection?.credentials[field.key]
  return field.type === "secret" && typeof value === "string" && value !== ""
    ? value
    : null
}

/** Secrets start blank (blank = keep the saved value); others show the stored value. */
const initialValues = (
  fields: IntegrationFieldDefinition[],
  stored: IntegrationValues,
  connection: StoreIntegrationDTO | null
): FieldValues =>
  Object.fromEntries(
    fields.map((field) => {
      if (field.type === "boolean") {
        return [field.key, Boolean(stored[field.key] ?? field.default_value ?? false)]
      }
      if (field.type === "secret" && storedSecret(connection, field)) {
        return [field.key, ""]
      }
      const value = stored[field.key] ?? field.default_value
      return [field.key, value === undefined || value === null ? "" : String(value)]
    })
  )

const fieldsSchema = (
  t: TFunction,
  fields: IntegrationFieldDefinition[],
  connection: StoreIntegrationDTO | null
) =>
  z.object(
    Object.fromEntries(
      fields.map((field) => {
        if (field.type === "boolean") {
          return [field.key, z.boolean()]
        }
        const keepsSecret = !!storedSecret(connection, field)
        const base = z.string().trim()
        return [
          field.key,
          field.required && !keepsSecret
            ? base.min(1, t("integrations.form.required", { label: field.label }))
            : base,
        ]
      })
    )
  )

/** Form values → API values. A blank secret sends the stored masked value, which the API keeps. */
const toPayload = (
  fields: IntegrationFieldDefinition[],
  values: FieldValues,
  connection: StoreIntegrationDTO | null
): IntegrationValues =>
  Object.fromEntries(
    fields.map((field) => {
      const value = values[field.key]
      if (field.type === "boolean") {
        return [field.key, Boolean(value)]
      }
      const text = typeof value === "string" ? value.trim() : ""
      if (field.type === "secret" && text === "") {
        return [field.key, storedSecret(connection, field)]
      }
      if (field.type === "number") {
        return [field.key, text === "" ? null : Number(text)]
      }
      return [field.key, text === "" ? null : text]
    })
  )

export const IntegrationForm = ({ integration }: IntegrationFormProps) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { handleSuccess } = useRouteModal()
  const { provider, connection } = integration

  const credentialFields = provider.credential_fields
  const settingFields = provider.setting_fields ?? NO_FIELDS

  const schema = useMemo(
    () =>
      z.object({
        is_enabled: z.boolean(),
        credentials: fieldsSchema(t, credentialFields, connection),
        settings: fieldsSchema(t, settingFields, connection),
      }),
    [t, credentialFields, settingFields, connection]
  )

  const form = useForm<FormValues>({
    defaultValues: {
      is_enabled: connection?.is_enabled ?? true,
      credentials: initialValues(credentialFields, connection?.credentials ?? {}, connection),
      settings: initialValues(settingFields, connection?.settings ?? {}, connection),
    },
    resolver: zodResolver(schema),
  })

  const [testResult, setTestResult] = useState<IntegrationTestResult | null>(null)

  const save = useSaveIntegration(provider.id)
  const test = useTestIntegration(provider.id)
  const disconnect = useDeleteIntegration(provider.id)

  const payloadFrom = (values: FormValues) => ({
    credentials: toPayload(credentialFields, values.credentials, connection),
    settings: toPayload(settingFields, values.settings, connection),
  })

  const handleTest = form.handleSubmit(async (values) => {
    setTestResult(null)
    await test.mutateAsync(payloadFrom(values), {
      onSuccess: ({ test_result }) => setTestResult(test_result),
      onError: (e) => toast.error(e.message),
    })
  })

  const handleSave = form.handleSubmit(async (values) => {
    await save.mutateAsync(
      { ...payloadFrom(values), is_enabled: values.is_enabled },
      {
        onSuccess: ({ test_result }) => {
          if (test_result && !test_result.ok) {
            toast.warning(
              t("integrations.toasts.savedButFailed", {
                title: provider.title,
                message: test_result.message,
              })
            )
          } else {
            toast.success(t("integrations.toasts.saved", { title: provider.title }))
          }
          handleSuccess()
        },
        onError: (e) => toast.error(e.message),
      }
    )
  })

  const handleDisconnect = async () => {
    const confirmed = await prompt({
      title: t("general.areYouSure"),
      description: t("integrations.disconnect.confirmation", { title: provider.title }),
      confirmText: t("integrations.actions.disconnect"),
      cancelText: t("actions.cancel"),
    })
    if (!confirmed) {
      return
    }
    await disconnect.mutateAsync(undefined, {
      onSuccess: () => {
        toast.success(t("integrations.toasts.disconnected", { title: provider.title }))
        handleSuccess()
      },
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm
        className="flex size-full flex-col overflow-hidden"
        onSubmit={handleSave}
      >
        <RouteDrawer.Body className="flex flex-1 flex-col gap-y-6 overflow-auto">
          <div className="flex flex-col gap-y-1">
            <Text size="small" className="text-ui-fg-subtle">
              {provider.description}
            </Text>
            {provider.docs_url && (
              <a
                href={provider.docs_url}
                target="_blank"
                rel="noopener noreferrer"
                className="txt-compact-small text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
              >
                {t("integrations.docs")}
              </a>
            )}
          </div>

          {connection?.status === StoreIntegrationStatus.ERROR &&
            connection.last_error &&
            !testResult && (
              <Alert variant="error">
                <Text size="small" weight="plus">
                  {t("integrations.form.lastError")}
                </Text>
                <Text size="small">{connection.last_error}</Text>
              </Alert>
            )}

          <div className="flex flex-col gap-y-4">
            <Text size="small" weight="plus" leading="compact">
              {t("integrations.form.credentials")}
            </Text>
            {credentialFields.map((field) => (
              <IntegrationField
                key={field.key}
                control={form.control}
                name={`credentials.${field.key}`}
                field={field}
                storedSecret={storedSecret(connection, field)}
              />
            ))}
          </div>

          {settingFields.length > 0 && (
            <div className="flex flex-col gap-y-4">
              <Text size="small" weight="plus" leading="compact">
                {t("integrations.form.settings")}
              </Text>
              {settingFields.map((field) => (
                <IntegrationField
                  key={field.key}
                  control={form.control}
                  name={`settings.${field.key}`}
                  field={field}
                  storedSecret={null}
                />
              ))}
            </div>
          )}

          {connection && (
            <IntegrationField
              control={form.control}
              name="is_enabled"
              field={{
                key: "is_enabled",
                label: t("integrations.form.enabled"),
                help_text: t("integrations.form.enabledHint"),
                type: "boolean",
              }}
              storedSecret={null}
            />
          )}

          {testResult && (
            <Alert
              variant={testResult.ok ? "success" : "error"}
              data-testid="integration-test-result"
            >
              <Text size="small" weight="plus">
                {testResult.ok
                  ? t("integrations.test.success")
                  : t("integrations.test.failure")}
              </Text>
              <Text size="small">{testResult.message}</Text>
            </Alert>
          )}
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex w-full items-center justify-between gap-x-2">
            <div>
              {connection && (
                <Button
                  variant="danger"
                  size="small"
                  type="button"
                  onClick={handleDisconnect}
                  isLoading={disconnect.isPending}
                >
                  {t("integrations.actions.disconnect")}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-x-2">
              <Button
                variant="secondary"
                size="small"
                type="button"
                onClick={handleTest}
                isLoading={test.isPending}
              >
                {t("integrations.actions.testConnection")}
              </Button>
              <Button size="small" type="submit" isLoading={save.isPending}>
                {t("actions.save")}
              </Button>
            </div>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}
