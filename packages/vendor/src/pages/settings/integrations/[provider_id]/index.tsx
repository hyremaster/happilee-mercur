import { Heading } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { RouteDrawer } from "@components/modals"
import { useIntegration } from "@hooks/api/integrations"

import { IntegrationForm } from "./_components/integration-form"

const IntegrationManage = () => {
  const { provider_id } = useParams()
  const { t } = useTranslation()

  const { integration, isPending, isError, error } = useIntegration(provider_id!)

  if (isError) {
    throw error
  }

  const title = integration?.provider.title ?? ""

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>
            {integration?.connection
              ? t("integrations.form.manageHeader", { title })
              : t("integrations.form.connectHeader", { title })}
          </Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          {integration?.provider.description}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      {!isPending && integration && (
        <IntegrationForm integration={integration} />
      )}
    </RouteDrawer>
  )
}

export const Component = IntegrationManage
