import {
  ClientError,
  InferClientInput,
  InferClientOutput,
} from "@mercurjs/client";
import {
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { sdk } from "../../lib/client";
import { queryClient } from "../../lib/query-client";
import { queryKeysFactory } from "../../lib/query-key-factory";
import { stockLocationsQueryKeys } from "./stock-locations";

const INTEGRATIONS_QUERY_KEY = "integrations" as const;
export const integrationsQueryKeys = queryKeysFactory(INTEGRATIONS_QUERY_KEY);

const invalidateIntegrations = (providerId: string) => {
  queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.lists() });
  queryClient.invalidateQueries({
    queryKey: integrationsQueryKeys.detail(providerId),
  });
};

export const useIntegrations = (
  options?: Omit<
    UseQueryOptions<
      unknown,
      ClientError,
      InferClientOutput<typeof sdk.vendor.integrations.query>
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.vendor.integrations.query({}),
    queryKey: integrationsQueryKeys.list(),
    ...options,
  });

  return { ...data, ...rest };
};

export const useIntegration = (
  providerId: string,
  options?: Omit<
    UseQueryOptions<
      unknown,
      ClientError,
      InferClientOutput<typeof sdk.vendor.integrations.$providerId.query>
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.vendor.integrations.$providerId.query({ $providerId: providerId }),
    queryKey: integrationsQueryKeys.detail(providerId),
    ...options,
  });

  return { ...data, ...rest };
};

export const useSaveIntegration = (
  providerId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.vendor.integrations.$providerId.mutate>,
    ClientError,
    Omit<
      InferClientInput<typeof sdk.vendor.integrations.$providerId.mutate>,
      "$providerId"
    >
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.vendor.integrations.$providerId.mutate({
        $providerId: providerId,
        ...payload,
      }),
    onSuccess: (data, variables, context) => {
      invalidateIntegrations(providerId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useTestIntegration = (
  providerId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.vendor.integrations.$providerId.test.mutate>,
    ClientError,
    Omit<
      InferClientInput<typeof sdk.vendor.integrations.$providerId.test.mutate>,
      "$providerId"
    >
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.vendor.integrations.$providerId.test.mutate({
        $providerId: providerId,
        ...payload,
      }),
    onSuccess: (data, variables, context) => {
      // Testing the saved connection records its status.
      invalidateIntegrations(providerId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useDeleteIntegration = (
  providerId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.vendor.integrations.$providerId.delete>,
    ClientError,
    void
  >
) => {
  return useMutation({
    mutationFn: () =>
      sdk.vendor.integrations.$providerId.delete({ $providerId: providerId }),
    onSuccess: (data, variables, context) => {
      invalidateIntegrations(providerId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

const invalidateLocations = (providerId: string) => {
  queryClient.invalidateQueries({
    queryKey: integrationsQueryKeys.detail(providerId, { scope: "locations" }),
  });
  queryClient.invalidateQueries({
    queryKey: integrationsQueryKeys.detail(providerId, { scope: "sync-runs" }),
  });
  queryClient.invalidateQueries({
    queryKey: integrationsQueryKeys.detail(providerId, { scope: "catalog" }),
  });
};

export const useIntegrationLocations = (
  providerId: string,
  options?: Omit<
    UseQueryOptions<
      unknown,
      ClientError,
      InferClientOutput<typeof sdk.vendor.integrations.$providerId.locations.query>
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.vendor.integrations.$providerId.locations.query({
        $providerId: providerId,
      }),
    queryKey: integrationsQueryKeys.detail(providerId, { scope: "locations" }),
    ...options,
  });

  return { ...data, ...rest };
};

export const useIntegrationSyncRuns = (
  providerId: string,
  options?: Omit<
    UseQueryOptions<
      unknown,
      ClientError,
      InferClientOutput<typeof sdk.vendor.integrations.$providerId.syncRuns.query>
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.vendor.integrations.$providerId.syncRuns.query({
        $providerId: providerId,
        limit: 10,
      }),
    queryKey: integrationsQueryKeys.detail(providerId, { scope: "sync-runs" }),
    ...options,
  });

  return { ...data, ...rest };
};

export const useIntegrationCatalogSummary = (
  providerId: string,
  options?: Omit<
    UseQueryOptions<
      unknown,
      ClientError,
      InferClientOutput<typeof sdk.vendor.integrations.$providerId.catalog.summary.query>
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      sdk.vendor.integrations.$providerId.catalog.summary.query({
        $providerId: providerId,
      }),
    queryKey: integrationsQueryKeys.detail(providerId, { scope: "catalog" }),
    ...options,
  });

  return { ...data, ...rest };
};

export const useRunIntegrationSync = (
  providerId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.vendor.integrations.$providerId.sync.mutate>,
    ClientError,
    Omit<
      InferClientInput<typeof sdk.vendor.integrations.$providerId.sync.mutate>,
      "$providerId"
    >
  >
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.vendor.integrations.$providerId.sync.mutate({
        $providerId: providerId,
        ...payload,
      }),
    onSuccess: (data, variables, context) => {
      invalidateLocations(providerId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useUpdateIntegrationLocation = (
  providerId: string,
  options?: UseMutationOptions<
    InferClientOutput<
      typeof sdk.vendor.integrations.$providerId.locations.$locationId.mutate
    >,
    ClientError,
    { location_id: string; stock_location_id: string | null }
  >
) => {
  return useMutation({
    mutationFn: ({ location_id, stock_location_id }) =>
      sdk.vendor.integrations.$providerId.locations.$locationId.mutate({
        $providerId: providerId,
        $locationId: location_id,
        stock_location_id,
      }),
    onSuccess: (data, variables, context) => {
      invalidateLocations(providerId);
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};

export const useCreateBranchFromLocation = (
  providerId: string,
  options?: UseMutationOptions<
    InferClientOutput<
      typeof sdk.vendor.integrations.$providerId.locations.$locationId.createBranch.mutate
    >,
    ClientError,
    { location_id: string }
  >
) => {
  return useMutation({
    mutationFn: ({ location_id }) =>
      sdk.vendor.integrations.$providerId.locations.$locationId.createBranch.mutate({
        $providerId: providerId,
        $locationId: location_id,
      }),
    onSuccess: (data, variables, context) => {
      invalidateLocations(providerId);
      queryClient.invalidateQueries({ queryKey: stockLocationsQueryKeys.lists() });
      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};
