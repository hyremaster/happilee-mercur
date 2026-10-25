import { UIMatch } from "react-router-dom"

import { useIntegration } from "@hooks/api/integrations"

export const Breadcrumb = (props: UIMatch) => {
  const { provider_id } = props.params || {}

  const { integration } = useIntegration(provider_id!, {
    enabled: Boolean(provider_id),
  })

  if (!integration) {
    return null
  }

  return <span>{integration.provider.title}</span>
}
