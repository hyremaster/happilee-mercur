import { useQuery } from "@tanstack/react-query";

import { listDefaultOrderStatuses } from "../../../services/onboardingServices";
import { mapApiOrderStatusesToConfig } from "./onboarding-mappers";

const DEFAULT_ORDER_STATUSES_QUERY_KEY = ["default-order-statuses"] as const;

export function useDefaultOrderStatuses() {
  const query = useQuery({
    queryKey: DEFAULT_ORDER_STATUSES_QUERY_KEY,
    queryFn: () => listDefaultOrderStatuses(),
    staleTime: 5 * 60 * 1000,
  });

  const defaultOrderStatuses = mapApiOrderStatusesToConfig(
    query.data?.order_statuses ?? [],
  );

  return {
    defaultOrderStatuses,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
