import { Mail01 } from "@happilee-app/icons";
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
import * as L from "leaflet";

type LatLng = { lat: number; lng: number };

type NominatimSearchResult = {
  lat: string;
  lon: string;
  display_name: string;
};

type NominatimReverseResult = {
  address?: Partial<{
    house_number: string;
    road: string;
    neighbourhood: string;
    suburb: string;
    city: string;
    town: string;
    village: string;
    state: string;
    country: string;
    postcode: string;
  }>;
};

const DEFAULT_CENTER: LatLng = { lat: 12.9698, lng: 77.75 };

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "HappileeVendorOnboarding/1.0",
};

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

function buildAddressFromReverse(address?: NominatimReverseResult["address"]) {
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

  const centerRef = useRef(center);
  centerRef.current = center;

  const lastUpdateSourceRef = useRef<"inputs" | "map" | null>(null);
  const skipGeocodeOnceRef = useRef(isEdit && centre?.lat != null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geocodeAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
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

  const searchQuery = useMemo(() => {
    const parts = [address, city, state, pinCode, country]
      .map((v) => v.trim())
      .filter(Boolean);
    return parts.join(", ");
  }, [address, city, country, pinCode, state]);

  const syncMapView = (next: LatLng, animate = false) => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([next.lat, next.lng], map.getZoom(), { animate });
  };

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

      const initial = centerRef.current;
      const map = L.map(container, {
        zoomControl: true,
        attributionControl: true,
      }).setView([initial.lat, initial.lng], 16);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      map.on("dragend", () => {
        const c = map.getCenter();
        lastUpdateSourceRef.current = "map";
        setCenter(clampLatLng({ lat: c.lat, lng: c.lng }));
      });

      mapRef.current = map;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled || !mapRef.current) return;
          map.invalidateSize();
          map.setView([centerRef.current.lat, centerRef.current.lng], 16, {
            animate: false,
          });
        });
      });
    };

    initTimer = setTimeout(() => initMap(), 0);

    return () => {
      cancelled = true;
      if (initTimer) clearTimeout(initTimer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (geocodeAbortRef.current) geocodeAbortRef.current.abort();
      if (reverseAbortRef.current) reverseAbortRef.current.abort();
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
      if (reverseTimeoutRef.current) clearTimeout(reverseTimeoutRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!searchQuery) return;
    if (lastUpdateSourceRef.current === "map") return;

    if (skipGeocodeOnceRef.current) {
      skipGeocodeOnceRef.current = false;
      return;
    }

    if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
    geocodeTimeoutRef.current = setTimeout(async () => {
      try {
        setIsLocating(true);
        setMapError(null);

        if (geocodeAbortRef.current) geocodeAbortRef.current.abort();
        const ac = new AbortController();
        geocodeAbortRef.current = ac;

        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("format", "json");
        url.searchParams.set("q", searchQuery);
        url.searchParams.set("limit", "1");

        const res = await fetch(url.toString(), {
          signal: ac.signal,
          headers: NOMINATIM_HEADERS,
        });

        if (!res.ok) {
          throw new Error(`Geocode failed (${res.status})`);
        }

        const json = (await res.json()) as NominatimSearchResult[];
        const first = json[0];
        if (!first) return;

        const next = clampLatLng({
          lat: Number(first.lat),
          lng: Number(first.lon),
        });

        lastUpdateSourceRef.current = "inputs";
        setCenter(next);
        syncMapView(next, true);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
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
        if (reverseAbortRef.current) reverseAbortRef.current.abort();
        const ac = new AbortController();
        reverseAbortRef.current = ac;

        const url = new URL("https://nominatim.openstreetmap.org/reverse");
        url.searchParams.set("format", "json");
        url.searchParams.set("lat", String(center.lat));
        url.searchParams.set("lon", String(center.lng));
        url.searchParams.set("zoom", "18");
        url.searchParams.set("addressdetails", "1");

        const res = await fetch(url.toString(), {
          signal: ac.signal,
          headers: NOMINATIM_HEADERS,
        });

        if (!res.ok) return;
        const json = (await res.json()) as NominatimReverseResult;
        const addr = json.address;
        if (!addr) return;

        setAddress((prev) => buildAddressFromReverse(addr) || prev);
        setCity((prev) => addr.city || addr.town || addr.village || prev);
        setState((prev) => addr.state || prev);
        setCountry((prev) => addr.country || prev);
        setPinCode((prev) => addr.postcode || prev);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
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

        <div className="grid grid-cols-4 gap-lg">
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
