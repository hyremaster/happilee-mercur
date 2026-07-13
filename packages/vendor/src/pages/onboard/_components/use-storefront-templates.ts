import { useQuery } from "@tanstack/react-query";

import {
  listStorefrontTemplates,
  type StorefrontTemplate,
} from "../../../services/onboardingServices";

const STOREFRONT_TEMPLATES_QUERY_KEY = ["storefront-templates"] as const;

export function sortStorefrontTemplates(
  templates: StorefrontTemplate[],
): StorefrontTemplate[] {
  return [...templates]
    .filter((template) => template.is_active)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

export function useStorefrontTemplates() {
  const query = useQuery({
    queryKey: STOREFRONT_TEMPLATES_QUERY_KEY,
    queryFn: listStorefrontTemplates,
    staleTime: 5 * 60 * 1000,
  });

  const templates = sortStorefrontTemplates(query.data?.storefront_templates ?? []);

  return {
    templates,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
