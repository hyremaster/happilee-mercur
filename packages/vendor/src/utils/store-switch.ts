import type { QueryClient } from "@tanstack/react-query";

/**
 * After switching stores, keep the user on the same top-level section
 * (e.g. /orders, /products) but drop any nested detail segment that
 * belonged to the previous store.
 */
export const getStoreSwitchTargetPath = (pathname: string): string => {
  const [, section] = pathname.split("/");
  return section ? `/${section}` : "/";
};

/**
 * Drop all cached React Query data after the active seller changes.
 *
 * Important: this must not await active refetches. Awaiting
 * `invalidateQueries()` made store switching wait on every mounted
 * query (products, orders, inventory, me, …) before navigation could
 * continue.
 */
export const resetQueriesAfterStoreSwitch = (
  queryClient: QueryClient,
): void => {
  void queryClient.cancelQueries();
  queryClient.removeQueries();
};
