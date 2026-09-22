import { Heading } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { RouteDrawer } from "@components/modals"

import { ProductTagCreateForm } from "./_components/product-tag-create-form"

const ProductTagCreate = () => {
  const { t } = useTranslation()

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("productTags.create.header")}</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          {t("productTags.create.subtitle")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      <ProductTagCreateForm />
    </RouteDrawer>
  )
}

export const Component = ProductTagCreate
