import {
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";

import { queryClient } from "../../lib/query-client";
import { queryKeysFactory } from "../../lib/query-key-factory";
import {
  createStoreLocation,
  deleteStoreLocation,
  getStoreLocations,
  updateStoreLocation,
  type CreateStoreLocationPayload,
  type DeleteStoreLocationResponse,
  type StoreLocationResponse,
  type StoreLocationsResponse,
  type UpdateStoreLocationPayload,
} from "../../services/storeServices";

const STORE_ONBOARDING_LOCATIONS_QUERY_KEY =
  "store_onboarding_locations" as const;

export const storeOnboardingLocationsQueryKeys = queryKeysFactory(
  STORE_ONBOARDING_LOCATIONS_QUERY_KEY,
);

export const useStoreOnboardingLocations = (
  storeId: string | null | undefined,
  options?: Omit<
    UseQueryOptions<StoreLocationsResponse, Error>,
    "queryKey" | "queryFn"
  >,
) => {
  const { data, ...rest } = useQuery({
    queryKey: storeOnboardingLocationsQueryKeys.list({ storeId }),
    queryFn: () => getStoreLocations(storeId!),
    enabled: !!storeId,
    ...options,
  });

  return {
    locations: data?.locations ?? [],
    count: data?.count ?? 0,
    ...rest,
  };
};

export const useCreateStoreOnboardingLocation = (
  storeId: string,
  options?: UseMutationOptions<
    StoreLocationResponse,
    Error,
    CreateStoreLocationPayload
  >,
) => {
  return useMutation({
    mutationFn: (payload) => createStoreLocation(storeId, payload),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: storeOnboardingLocationsQueryKeys.lists(),
      });
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useUpdateStoreOnboardingLocation = (
  storeId: string,
  options?: UseMutationOptions<
    StoreLocationResponse,
    Error,
    { locationId: string; payload: UpdateStoreLocationPayload }
  >,
) => {
  return useMutation({
    mutationFn: ({ locationId, payload }) =>
      updateStoreLocation(storeId, locationId, payload),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: storeOnboardingLocationsQueryKeys.lists(),
      });
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useDeleteStoreOnboardingLocation = (
  storeId: string,
  options?: UseMutationOptions<
    DeleteStoreLocationResponse,
    Error,
    string
  >,
) => {
  return useMutation({
    mutationFn: (locationId) => deleteStoreLocation(storeId, locationId),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: storeOnboardingLocationsQueryKeys.lists(),
      });
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};
