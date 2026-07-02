import { fetchQuery } from "../lib/client";

export type StoreOnboardingRow = {
  id: string;
  object: "store" | "store_draft";
  is_draft: boolean;
  status: string;
  name: string | null;
  owner_handle: string | null;
  industry: string | null;
  commerce_type: string | null;
  handle?: string | null;
  draft_id?: string;
  onboarding_step?: number;
  created_at: string;
  updated_at: string;
};

export type StoreOnboardingListResponse = {
  stores: StoreOnboardingRow[];
  count: number;
  offset: number;
  limit: number;
};

export type ListStoresQuery = {
  offset?: number;
  limit?: number;
  q?: string;
  industry?: string | string[];
  commerce_type?: string | string[];
  status?: string | string[];
};

const STORE_ONBOARDING_BASE = "/vendor/store-onboarding";

export const listStores = async (
  query?: ListStoresQuery,
): Promise<StoreOnboardingListResponse> => {
  return fetchQuery(STORE_ONBOARDING_BASE, {
    method: "GET",
    query,
  }) as Promise<StoreOnboardingListResponse>;
};
