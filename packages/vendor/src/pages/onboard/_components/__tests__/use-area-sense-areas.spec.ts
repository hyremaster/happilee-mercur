import { describe, expect, test } from "bun:test";

import {
  filterAreaSenseAreasByType,
  getAreaSenseAreaType,
} from "../area-sense-area-type";

const areas = [
  {
    area_sense_id: "geo-1",
    area_name: "Pattom",
    metadata: { area_type: "geo_locations", is_active: true },
  },
  {
    area_sense_id: "zip-1",
    area_name: "Pan India",
    metadata: { area_type: "zip_codes", is_active: true },
  },
  {
    area_sense_id: "unknown-1",
    area_name: "Legacy",
    metadata: { is_active: true },
  },
];

describe("filterAreaSenseAreasByType", () => {
  test("returns only geo_locations for local delivery", () => {
    expect(filterAreaSenseAreasByType(areas, "geo_locations")).toEqual([
      areas[0],
    ]);
  });

  test("returns only zip_codes for ecommerce shipping", () => {
    expect(filterAreaSenseAreasByType(areas, "zip_codes")).toEqual([areas[1]]);
  });

  test("getAreaSenseAreaType reads metadata.area_type", () => {
    expect(getAreaSenseAreaType(areas[0])).toBe("geo_locations");
    expect(getAreaSenseAreaType(areas[1])).toBe("zip_codes");
    expect(getAreaSenseAreaType(areas[2])).toBeNull();
  });
});
