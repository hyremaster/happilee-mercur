/** Area Sense location kinds used by Local Delivery vs Ecommerce Shipping. */
export type AreaSenseAreaType = "geo_locations" | "zip_codes";

export type AreaSenseAreaTypeSource = {
  metadata?: Record<string, unknown> | null;
};

export function getAreaSenseAreaType(
  area: AreaSenseAreaTypeSource,
): AreaSenseAreaType | null {
  const areaType = area.metadata?.area_type;
  if (areaType === "geo_locations" || areaType === "zip_codes") {
    return areaType;
  }
  return null;
}

/** Keep only areas whose metadata.area_type matches the fulfillment method. */
export function filterAreaSenseAreasByType<T extends AreaSenseAreaTypeSource>(
  areas: T[],
  areaType: AreaSenseAreaType,
): T[] {
  return areas.filter((area) => getAreaSenseAreaType(area) === areaType);
}
