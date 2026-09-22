import { Children, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button, Heading, Text } from "@medusajs/ui";

export const CategoryListTitle = () => {
  const { t } = useTranslation();
  return (
    <div>
      <Heading>{t("categories.domain")}</Heading>
      <Text className="text-ui-fg-subtle" size="small">
        Organize products into categories.
      </Text>
    </div>
  );
};

export const CategoryListActions = ({
  children,
}: {
  children?: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-x-2">
      {Children.count(children) > 0 ? (
        children
      ) : (
        <Link to="/categories/create">
          <Button size="small" variant="secondary">
            {t("actions.create")}
          </Button>
        </Link>
      )}
    </div>
  );
};

export const CategoryListHeader = ({
  children,
}: {
  children?: ReactNode;
}) => {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      {Children.count(children) > 0 ? (
        children
      ) : (
        <>
          <CategoryListTitle />
          <CategoryListActions />
        </>
      )}
    </div>
  );
};
