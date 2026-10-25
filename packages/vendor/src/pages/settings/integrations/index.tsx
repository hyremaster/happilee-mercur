import { SingleColumnPage } from "@components/layout/pages"

import { IntegrationList } from "./_components/integration-list"

const IntegrationsPage = () => {
  return (
    <SingleColumnPage showMetadata={false} showJSON={false}>
      <IntegrationList />
    </SingleColumnPage>
  )
}

export const Component = IntegrationsPage
