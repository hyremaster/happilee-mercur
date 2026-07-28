import { useQuery } from "@tanstack/react-query";

import {
  listAreaSenseAreas,
  type AreaSenseArea,
} from "../../../services/onboardingServices";
import {
  filterAreaSenseAreasByType,
  getAreaSenseAreaType,
  type AreaSenseAreaType,
} from "./area-sense-area-type";

export type { AreaSenseAreaType };
export { filterAreaSenseAreasByType, getAreaSenseAreaType };

const AREA_SENSE_AREAS_QUERY_KEY = ["area-sense-areas"] as const;

export function sortAreaSenseAreas(areas: AreaSenseArea[]): AreaSenseArea[] {
  return [...areas].sort((a, b) => a.area_name.localeCompare(b.area_name));
}

export function useAreaSenseAreas() {
  const query = useQuery({
    queryKey: AREA_SENSE_AREAS_QUERY_KEY,
    queryFn: () => listAreaSenseAreas(),
    staleTime: 5 * 60 * 1000,
  });

  const areas = sortAreaSenseAreas(query.data?.areas ?? []);

  return {
    areas,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
