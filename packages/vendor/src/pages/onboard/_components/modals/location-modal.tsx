import { Mail01, SearchLg } from "@happilee-app/icons";
import { Button, InputField, Modal, Textarea } from "@happilee-app/ui";
import { CountrySelectField, StateSelectField } from "../address-select-fields";
import {
  clampFieldLength,
  FIELD_LIMIT_ADDRESS,
  FIELD_LIMIT_DEFAULT,
  FIELD_LIMIT_LOCATION_NAME,
  FIELD_LIMIT_PIN_CODE,
} from "../field-limits";
import type { FulfillmentCentre } from "../types";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";

type LatLng = { lat: number; lng: number };

type ReverseAddress = Partial<{
  house_number: string;
  road: string;
  neighbourhood: string;
  suburb: string;
  city: string;
  state: string;
  country: string;
  postcode: string;
}>;

const DEFAULT_CENTER: LatLng = { lat: 12.9698, lng: 77.75 };

const MAP_ZOOM = 16;
const MIN_SEARCH_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 400;
const MAX_SEARCH_RESULTS = 6;

type SearchResult = { lat: number; lng: number; label: string };

type AddressFields = {
  address: string;
  city: string;
  state: string;
  pinCode: string;
  country: string;
};

function joinAddressQuery(v: AddressFields) {
  return [v.address, v.city, v.state, v.pinCode, v.country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

// Google's geocoder has no cancellation, so a lookup that is no longer the
// latest is ignored via a sequence counter instead of an AbortController.
class StaleRequestError extends Error {}

function findComponent(
  results: google.maps.GeocoderResult[],
  ...types: string[]
): string | undefined {
  for (const type of types) {
    for (const result of results) {
      const match = result.address_components.find((c) =>
        c.types.includes(type),
      );
      if (match) return match.long_name;
    }
  }
  return undefined;
}

async function geocode(
  request: google.maps.GeocoderRequest,
): Promise<google.maps.GeocoderResult[]> {
  const maps = await loadGoogleMaps();
  const geocoder = new maps.Geocoder();
  return new Promise((resolve, reject) => {
    geocoder.geocode(request, (results, status) => {
      if (status === "OK" && results) resolve(results);
      else if (status === "ZERO_RESULTS") resolve([]);
      else reject(new Error(`Geocode failed (${status})`));
    });
  });
}

function parseReverseResults(
  results: google.maps.GeocoderResult[],
): ReverseAddress | undefined {
  // Plus-code results carry no usable address; prefer real ones.
  const usable = results.filter((r) => !r.types.includes("plus_code"));
  const list = usable.length ? usable : results;
  if (!list.length) return undefined;

  return {
    house_number: findComponent([list[0]], "street_number"),
    road: findComponent([list[0]], "route"),
    neighbourhood: findComponent([list[0]], "neighborhood"),
    suburb: findComponent([list[0]], "sublocality_level_1", "sublocality"),
    city: findComponent(
      list,
      "locality",
      "postal_town",
      "administrative_area_level_2",
    ),
    state: findComponent(list, "administrative_area_level_1"),
    country: findComponent(list, "country"),
    postcode: findComponent(list, "postal_code"),
  };
}

type LocationModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  centre?: FulfillmentCentre | null;
  onSave: (centre: FulfillmentCentre) => void | Promise<void>;
  isSaving?: boolean;
};

function createLocationId() {
  const cryptoAny = crypto as unknown as Partial<{ randomUUID: () => string }>;
  if (cryptoAny.randomUUID) return cryptoAny.randomUUID();
  return `loc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clampLatLng(value: LatLng): LatLng {
  return {
    lat: Math.max(-90, Math.min(90, value.lat)),
    lng: ((value.lng + 180) % 360) - 180,
  };
}

function formatLatLng(value: LatLng) {
  return `Lat ${value.lat.toFixed(6)}, Lng ${value.lng.toFixed(6)}`;
}

function buildAddressFromReverse(address?: ReverseAddress) {
  if (!address) return "";
  const parts = [
    address.house_number,
    address.road,
    address.neighbourhood,
    address.suburb,
  ].filter(Boolean);
  return parts.join(", ");
}

function resolveInitialCenter(centre?: FulfillmentCentre | null): LatLng {
  if (centre?.lat != null && centre.lng != null) {
    return { lat: centre.lat, lng: centre.lng };
  }
  return DEFAULT_CENTER;
}

function PinMarker() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1000]">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-3 w-3 rounded-full bg-bg-primary ring-2 ring-bg-brand shadow-sm" />
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          aria-hidden="true"
          className="drop-shadow-md"
        >
          <path
            d="M22 42c0 0 13-12.4 13-23.2C35 12 29.2 6 22 6S9 12 9 18.8C9 29.6 22 42 22 42Z"
            fill="var(--colors-brand-600)"
          />
          <circle cx="22" cy="18.8" r="8.2" fill="white" opacity="0.95" />
          <circle cx="22" cy="18.8" r="5.6" fill="var(--colors-brand-600)" />
        </svg>
      </div>
    </div>
  );
}

export const LocationModal = ({
  isOpen,
  onOpenChange,
  mode,
  centre,
  onSave,
  isSaving = false,
}: LocationModalProps) => {
  const isEdit = mode === "edit" && centre != null;

  const [name, setName] = useState(() => (isEdit ? centre.name : ""));
  const [address, setAddress] = useState(() => (isEdit ? centre.address : ""));
  const [country, setCountry] = useState(() => (isEdit ? centre.country : ""));
  const [state, setState] = useState(() => (isEdit ? centre.state : ""));
  const [city, setCity] = useState(() => (isEdit ? centre.city : ""));
  const [pinCode, setPinCode] = useState(() => (isEdit ? centre.pinCode : ""));

  const [center, setCenter] = useState<LatLng>(() => resolveInitialCenter(centre));
  const [isLocating, setIsLocating] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [hoveredResult, setHoveredResult] = useState<number | null>(null);

  const centerRef = useRef(center);
  centerRef.current = center;

  const lastUpdateSourceRef = useRef<"inputs" | "map" | null>(null);
  // The address-fields query that must NOT move the map: the saved address
  // of a location being edited, or the fields we just filled in from the pin.
  // Compared by value (not a one-shot flag) so React StrictMode's double
  // effect run can't slip a geocode through and jump away from the pin.
  const suppressedQueryRef = useRef<string | null>(
    isEdit && centre?.lat != null
      ? joinAddressQuery({
          address: centre.address,
          city: centre.city,
          state: centre.state,
          pinCode: centre.pinCode,
          country: centre.country,
        })
      : null,
  );
  const fieldsRef = useRef<AddressFields>({ address, city, state, pinCode, country });
  fieldsRef.current = { address, city, state, pinCode, country };
  const searchSeqRef = useRef(0);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const pickedLabelRef = useRef<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocodeSeqRef = useRef(0);
  const reverseSeqRef = useRef(0);
  const geocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFromCountry = () => {
    setState("");
    setCity("");
    setPinCode("");
  };

  const clearFromState = () => {
    setCity("");
    setPinCode("");
  };

  const clearFromCity = () => {
    setPinCode("");
  };

  const markInputsChange = () => {
    lastUpdateSourceRef.current = null;
    setMapError(null);
  };

  // Moves the pin to a searched place. Routed through the same path as a
  // pin drag ("map" source) so the address fields are filled in from it.
  const applyPlace = (place: SearchResult) => {
    const next = clampLatLng({ lat: place.lat, lng: place.lng });
    const current = centerRef.current;
    const moved = next.lat !== current.lat || next.lng !== current.lng;

    searchSeqRef.current++;
    pickedLabelRef.current = place.label;
    setSearchInput(place.label);
    setSearchResults([]);
    setIsSearchOpen(false);
    setIsSearching(false);
    setMapError(null);

    if (moved) lastUpdateSourceRef.current = "map";
    setCenter(next);
    syncMapView(next, true);
  };

  const handleSearchEnter = async () => {
    if (searchResults.length > 0) {
      applyPlace(searchResults[0]);
      return;
    }
    const query = searchInput.trim();
    if (query.length < MIN_SEARCH_LENGTH) return;

    try {
      setIsLocating(true);
      setMapError(null);
      const seq = ++geocodeSeqRef.current;
      const results = await geocode({ address: query });
      if (seq !== geocodeSeqRef.current) return;

      const first = results[0];
      if (!first) {
        setMapError("No location found. Try a different search.");
        return;
      }
      applyPlace({
        lat: first.geometry.location.lat(),
        lng: first.geometry.location.lng(),
        label: first.formatted_address,
      });
    } catch {
      setMapError("Couldn't find this location. Try adding more details.");
    } finally {
      setIsLocating(false);
    }
  };

  const searchQuery = useMemo(
    () => joinAddressQuery({ address, city, state, pinCode, country }),
    [address, city, country, pinCode, state],
  );

  const syncMapView = (next: LatLng, animate = false) => {
    const map = mapRef.current;
    if (!map) return;
    if (animate) map.panTo(next);
    else map.setCenter(next);
  };

  // A new location (nothing saved yet) starts at the user's current position
  // instead of the hardcoded default. Goes through the "map" source so the
  // address fields are reverse-geocoded from it. Silently keeps the default
  // if permission is denied or unavailable.
  useEffect(() => {
    if (!isOpen || (centre?.lat != null && centre.lng != null)) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const next = clampLatLng({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        lastUpdateSourceRef.current = "map";
        setCenter(next);
        syncMapView(next);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let initTimer: ReturnType<typeof setTimeout> | null = null;

    const initMap = (attempt = 0) => {
      if (cancelled || mapRef.current) return;

      const container = mapContainerRef.current;
      if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) {
        if (attempt < 30) {
          initTimer = setTimeout(() => initMap(attempt + 1), 50);
        }
        return;
      }

      loadGoogleMaps()
        .then((maps) => {
          if (cancelled || mapRef.current) return;

          const initial = centerRef.current;
          const map = new maps.Map(container, {
            center: initial,
            zoom: MAP_ZOOM,
            maxZoom: 19,
            disableDefaultUI: true,
            zoomControl: true,
            zoomControlOptions: {
              position: maps.ControlPosition.LEFT_TOP,
            },
            gestureHandling: "greedy",
            clickableIcons: false,
            keyboardShortcuts: false,
          });

          map.addListener("dragend", () => {
            const c = map.getCenter();
            if (!c) return;
            lastUpdateSourceRef.current = "map";
            setCenter(clampLatLng({ lat: c.lat(), lng: c.lng() }));
          });

          mapRef.current = map;

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (cancelled || !mapRef.current) return;
              maps.event.trigger(map, "resize");
              map.setZoom(MAP_ZOOM);
              map.setCenter(centerRef.current);
            });
          });
        })
        .catch(() => {
          if (!cancelled) setMapError("Map could not be loaded. Please try again later.");
        });
    };

    initTimer = setTimeout(() => initMap(), 0);

    return () => {
      cancelled = true;
      if (initTimer) clearTimeout(initTimer);
      if (mapRef.current) {
        google.maps.event.clearInstanceListeners(mapRef.current);
        mapRef.current = null;
      }
      geocodeSeqRef.current++;
      reverseSeqRef.current++;
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
      if (reverseTimeoutRef.current) clearTimeout(reverseTimeoutRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    const query = searchInput.trim();
    if (!isOpen || query.length < MIN_SEARCH_LENGTH) {
      searchSeqRef.current++;
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    // The text was just set by picking a result — don't search it again.
    if (query === pickedLabelRef.current) return;

    const timer = setTimeout(async () => {
      const seq = ++searchSeqRef.current;
      setIsSearching(true);
      try {
        const results = await geocode({ address: query });
        if (seq !== searchSeqRef.current) return;
        setSearchResults(
          results.slice(0, MAX_SEARCH_RESULTS).map((r) => ({
            lat: r.geometry.location.lat(),
            lng: r.geometry.location.lng(),
            label: r.formatted_address,
          })),
        );
        setIsSearchOpen(true);
        setMapError(null);
      } catch {
        if (seq !== searchSeqRef.current) return;
        setSearchResults([]);
        setMapError("Couldn't search locations. Try again.");
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isOpen, searchInput]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!searchQuery) return;
    if (lastUpdateSourceRef.current === "map") return;

    if (searchQuery === suppressedQueryRef.current) return;
    suppressedQueryRef.current = null;

    if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
    geocodeTimeoutRef.current = setTimeout(async () => {
      try {
        setIsLocating(true);
        setMapError(null);

        const seq = ++geocodeSeqRef.current;
        const results = await geocode({ address: searchQuery });
        if (seq !== geocodeSeqRef.current) throw new StaleRequestError();

        const first = results[0]?.geometry.location;
        if (!first) return;

        const next = clampLatLng({ lat: first.lat(), lng: first.lng() });

        lastUpdateSourceRef.current = "inputs";
        setCenter(next);
        syncMapView(next, true);
      } catch (e) {
        if (e instanceof StaleRequestError) return;
        setMapError("Couldn't locate this address. Try adding more details.");
      } finally {
        setIsLocating(false);
      }
    }, 700);

    return () => {
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
    };
  }, [isOpen, searchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    if (lastUpdateSourceRef.current !== "map") return;

    if (reverseTimeoutRef.current) clearTimeout(reverseTimeoutRef.current);
    reverseTimeoutRef.current = setTimeout(async () => {
      try {
        const seq = ++reverseSeqRef.current;
        const results = await geocode({
          location: { lat: center.lat, lng: center.lng },
        });
        if (seq !== reverseSeqRef.current) return;

        const addr = parseReverseResults(results);
        if (!addr) return;

        const cur = fieldsRef.current;
        const next: AddressFields = {
          address: buildAddressFromReverse(addr) || cur.address,
          city: addr.city || cur.city,
          state: addr.state || cur.state,
          country: addr.country || cur.country,
          pinCode: addr.postcode || cur.pinCode,
        };
        // These fields describe the pin's own position; forward-geocoding
        // them again would pan the map away from where the user put it.
        suppressedQueryRef.current = joinAddressQuery(next);
        setAddress(next.address);
        setCity(next.city);
        setState(next.state);
        setCountry(next.country);
        setPinCode(next.pinCode);
      } catch {
        // Reverse lookup is best-effort; keep whatever the user has.
      } finally {
        lastUpdateSourceRef.current = null;
      }
    }, 500);

    return () => {
      if (reverseTimeoutRef.current) clearTimeout(reverseTimeoutRef.current);
    };
  }, [center.lat, center.lng, isOpen]);

  const canSubmit =
    name.trim().length > 0 && address.trim().length > 0 && country.trim().length > 0;

  const handleClose = () => {
    setMapError(null);
    onOpenChange(false);
  };

  const handleModalOpenChange = (open: boolean) => {
    if (!open) {
      handleClose();
      return;
    }
    onOpenChange(true);
  };

  const handleSave = async () => {
    if (isEdit && !centre) return;

    const saved: FulfillmentCentre = {
      id: isEdit ? centre.id : createLocationId(),
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      country: country.trim(),
      pinCode: pinCode.trim(),
      active: isEdit ? centre.active : true,
      lat: center.lat,
      lng: center.lng,
    };

    try {
      await onSave(saved);
      handleClose();
    } catch {
      // Parent handles error feedback.
    }
  };

  const title = mode === "edit" ? "Edit location" : "Add new location";
  const submitLabel = mode === "edit" ? "Save changes" : "Add location";

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={handleModalOpenChange}
      title={title}
      subtitle="Outlets and warehouses you fulfill from."
      size="xl"
      footer={
        <>
          <Button hierarchy="secondary" size="md" onPress={handleClose}>
            Cancel
          </Button>
          <Button
            hierarchy="primary"
            size="md"
            onPress={() => void handleSave()}
            isDisabled={!canSubmit || isSaving}
            isLoading={isSaving}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-xl">
        <InputField
          label="Location name"
          isRequired
          placeholder="e.g. Whitefield outlet"
          iconLeading={<Mail01 />}
          value={name}
          onChange={(v) => {
            markInputsChange();
            setName(clampFieldLength(v, FIELD_LIMIT_LOCATION_NAME));
          }}
        />
        <Textarea
          label="Address"
          isRequired
          placeholder="123 Commerce Street, Floor 4"
          rows={3}
          value={address}
          onChange={(v) => {
            markInputsChange();
            setAddress(clampFieldLength(v, FIELD_LIMIT_ADDRESS));
          }}
        />

        <div className="grid grid-cols-4 gap-lg [&>*]:min-w-0">
          <CountrySelectField
            label="Country"
            placeholder="Select country"
            value={country}
            onChange={(v) => {
              markInputsChange();
              setCountry(v);
              clearFromCountry();
            }}
          />
          <StateSelectField
            label="State"
            placeholder="Select state"
            country={country}
            value={state}
            onChange={(v) => {
              markInputsChange();
              setState(v);
              clearFromState();
            }}
          />
          <InputField
            label="City"
            placeholder="Mumbai"
            value={city}
            onChange={(v) => {
              markInputsChange();
              setCity(clampFieldLength(v, FIELD_LIMIT_DEFAULT));
              clearFromCity();
            }}
          />
          <InputField
            label="Pincode"
            placeholder="400001"
            value={pinCode}
            onChange={(v) => {
              markInputsChange();
              setPinCode(clampFieldLength(v, FIELD_LIMIT_PIN_CODE));
            }}
          />
        </div>

        <div className="flex flex-col gap-sm">
          <span className="text-sm font-medium text-text-secondary">
            Pin location on map
          </span>

          <div ref={searchWrapRef} className="relative flex flex-col gap-sm">
            <InputField
              placeholder="Search for an address"
              iconLeading={<SearchLg />}
              value={searchInput}
              onChange={(v) => {
                pickedLabelRef.current = null;
                setSearchInput(v);
                setIsSearchOpen(true);
              }}
              onFocus={() => {
                if (searchResults.length > 0) setIsSearchOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleSearchEnter();
                } else if (e.key === "Escape" && isSearchOpen) {
                  e.stopPropagation();
                  setIsSearchOpen(false);
                }
              }}
              isDisabled={isLocating}
              size="sm"
            />

            {isSearchOpen && (isSearching || searchResults.length > 0) && (
              <div
                className="absolute left-0 right-0 top-full z-[1100] overflow-y-auto rounded-md border border-border-secondary bg-bg-primary shadow-lg"
                style={{ marginTop: 6, maxHeight: 240, padding: 6 }}
              >
                {isSearching && searchResults.length === 0 ? (
                  <p
                    className="text-sm text-text-tertiary"
                    style={{ padding: "10px 12px" }}
                  >
                    Searching…
                  </p>
                ) : (
                  <ul role="listbox" onMouseLeave={() => setHoveredResult(null)}>
                    {searchResults.map((place, i) => (
                      <li key={`${place.lat}-${place.lng}-${i}`} role="option">
                        <button
                          type="button"
                          onClick={() => applyPlace(place)}
                          onMouseEnter={() => setHoveredResult(i)}
                          className="flex w-full items-start text-left text-sm text-text-primary"
                          style={{
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 6,
                            cursor: "pointer",
                            transition: "background-color 150ms ease",
                            backgroundColor:
                              hoveredResult === i
                                ? "var(--colors-brand-50, #fff5e6)"
                                : "transparent",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--colors-brand-600)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                            style={{ flexShrink: 0, marginTop: 2 }}
                          >
                            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span style={{ lineHeight: 1.4 }}>{place.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="location-map relative h-[280px] w-full overflow-hidden rounded-md border border-border-secondary">
            <div
              ref={mapContainerRef}
              className="absolute inset-0 z-0 h-full w-full"
            />
            <PinMarker />
          </div>

          <div className="flex items-center justify-between gap-md">
            <span className="text-sm text-text-tertiary">{formatLatLng(center)}</span>
            <span className="text-sm text-text-tertiary">
              {isLocating
                ? "Locating…"
                : mapError
                  ? mapError
                  : "Drag the map to adjust the pin"}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
