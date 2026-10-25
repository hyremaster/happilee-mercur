import { IntegrationCapability } from "@mercurjs/types"
import { useParams } from "react-router-dom"

import { SingleColumnPage } from "@components/layout/pages"
import { useIntegration } from "@hooks/api/integrations"

import { IntegrationActivitySection } from "./_components/integration-activity-section"
import { IntegrationConnectionSection } from "./_components/integration-connection-section"
import { IntegrationLocationsSection } from "./_components/integration-locations-section"

/**
 * Settings → Integrations → provider: connection status (Manage opens the
 * credentials drawer at `manage`), plus capability-driven sections such as
 * Locations, and the sync activity log.
 */
const IntegrationDetailPage = () => {
  const { provider_id } = useParams()
  const { integration, isPending, isError, error } = useIntegration(provider_id!)

  if (isError) {
    throw error
  }

  if (isPending || !integration) {
    return null
  }

  const { provider, connection } = integration
  const supportsLocations = provider.capabilities.includes(IntegrationCapability.LOCATIONS)

  return (
    <SingleColumnPage showMetadata={false} showJSON={false} hasOutlet>
      <IntegrationConnectionSection integration={integration} />
      {connection && supportsLocations && (
        <IntegrationLocationsSection provider={provider} />
      )}
      {connection && <IntegrationActivitySection providerId={provider.id} />}
    </SingleColumnPage>
  )
}

export const Component = IntegrationDetailPage
