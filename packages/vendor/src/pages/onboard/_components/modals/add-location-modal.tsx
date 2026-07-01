import { Mail01 } from "@happilee-app/icons";
import { Button, InputField, Modal, Textarea } from "@happilee-app/ui";
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

type AddLocationModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAddCentre: (centre: FulfillmentCentre) => void;
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

function PinMarker() {
  return (
    <>
      {/* Exact target point (map center) */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ zIndex: 1000 }}
      >
        <div className="h-3 w-3 rounded-full bg-bg-primary ring-2 ring-bg-brand shadow-sm" />
      </div>

      {/* Pin: its TIP is aligned to the map center */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
        style={{ zIndex: 1000 }}
      >
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
    </>
  );
}

export const AddLocationModal = ({
  isOpen,
  onOpenChange,
  onAddCentre,
}: AddLocationModalProps) => {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [pinCode, setPinCode] = useState("");

  const [center, setCenter] = useState<LatLng>({ lat: 12.9698, lng: 77.75 });
  const [isLocating, setIsLocating] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const lastUpdateSourceRef = useRef<"inputs" | "map" | null>(null);
  const shouldFlyToRef = useRef(false);
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
    setAddress("");
  };

  const clearFromState = () => {
    setCity("");
    setPinCode("");
    setAddress("");
  };

  const clearFromCity = () => {
    setPinCode("");
    setAddress("");
  };

  const markInputsChange = () => {
    lastUpdateSourceRef.current = null;
    setMapError(null);
  };

  const searchQuery = useMemo(() => {
    const parts = [address, city, state, pinCode, country]
      .map((v) => v.trim())
      .filter(Boolean);

    // When user edits higher-level fields, they expect the map to follow even if address is cleared.
    // Nominatim works fine with partial queries (e.g. "India", "Kerala, India", "Mumbai, Maharashtra, India").
    return parts.join(", ");
  }, [address, city, country, pinCode, state]);

  useEffect(() => {
    if (!isOpen) return;
    return () => {
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
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([center.lat, center.lng], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on("moveend", () => {
      const c = map.getCenter();
      lastUpdateSourceRef.current = "map";
      setCenter(clampLatLng({ lat: c.lat, lng: c.lng }));
    });

    mapRef.current = map;

    // Leaflet needs an explicit resize when mounted in a modal/dialog.
    // Without this, tiles can appear blank and interactions feel "not working".
    setTimeout(() => {
      map.invalidateSize();
    }, 0);
  }, [center.lat, center.lng, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const map = mapRef.current;
    if (!map) return;

    // When the modal opens (or finishes animating), ensure Leaflet recalculates size.
    const t = setTimeout(() => {
      map.invalidateSize();
      map.setView([center.lat, center.lng], map.getZoom(), { animate: false });
    }, 50);

    return () => clearTimeout(t);
  }, [isOpen, center.lat, center.lng]);

  useEffect(() => {
    if (!isOpen) return;
    const map = mapRef.current;
    if (!map) return;
    if (!shouldFlyToRef.current) return;
    shouldFlyToRef.current = false;
    map.flyTo([center.lat, center.lng], map.getZoom(), { duration: 0.6 });
  }, [center.lat, center.lng, isOpen]);

  // Inputs → geocode → pan map
  useEffect(() => {
    if (!isOpen) return;
    if (!searchQuery) return;
    if (lastUpdateSourceRef.current === "map") return;

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
          headers: { Accept: "application/json" },
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
        shouldFlyToRef.current = true;
        setCenter(next);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setMapError("Couldn’t locate this address. Try adding more details.");
      } finally {
        setIsLocating(false);
      }
    }, 700);

    return () => {
      if (geocodeTimeoutRef.current) clearTimeout(geocodeTimeoutRef.current);
    };
  }, [isOpen, searchQuery]);

  // Map pan → reverse geocode → fill inputs
  useEffect(() => {
    if (!isOpen) return;
    if (lastUpdateSourceRef.current === "inputs") {
      lastUpdateSourceRef.current = null;
      return;
    }

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
          headers: { Accept: "application/json" },
        });

        if (!res.ok) return;
        const json = (await res.json()) as NominatimReverseResult;
        const addr = json.address;
        if (!addr) return;

        lastUpdateSourceRef.current = "map";
        setAddress((prev) => buildAddressFromReverse(addr) || prev);
        setCity((prev) => addr.city || addr.town || addr.village || prev);
        setState((prev) => addr.state || prev);
        setCountry((prev) => addr.country || prev);
        setPinCode((prev) => addr.postcode || prev);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }, 500);

    return () => {
      if (reverseTimeoutRef.current) clearTimeout(reverseTimeoutRef.current);
    };
  }, [center.lat, center.lng, isOpen]);

  const canSubmit = name.trim().length > 0 && address.trim().length > 0 && country.trim().length > 0;

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

  const handleAdd = () => {
    const centre: FulfillmentCentre = {
      id: createLocationId(),
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      country: country.trim(),
      pinCode: pinCode.trim(),
      active: true,
      lat: center.lat,
      lng: center.lng,
    };

    // Temporary debug visibility as requested
    // eslint-disable-next-line no-console
    console.log("[onboard] add fulfillment centre", centre);

    onAddCentre(centre);
    handleClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={handleModalOpenChange}
      title="Add new location"
      subtitle="Outlets and warehouses you fulfill from."
      size="xl"
      footer={
        <>
          <Button hierarchy="secondary" size="md" onPress={handleClose}>
            Cancel
          </Button>
          <Button hierarchy="primary" size="md" onPress={handleAdd} isDisabled={!canSubmit}>
            Add location
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
            setName(v);
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
            setAddress(v);
          }}
        />

        <div className="grid grid-cols-4 gap-lg">
          <InputField
            label="Country"
            placeholder="India"
            value={country}
            onChange={(v) => {
              markInputsChange();
              setCountry(v);
              clearFromCountry();
            }}
          />
          <InputField
            label="State"
            placeholder="Maharashtra"
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
              setCity(v);
              clearFromCity();
            }}
          />
          <InputField
            label="Pincode"
            placeholder="400001"
            value={pinCode}
            onChange={(v) => {
              markInputsChange();
              setPinCode(v);
            }}
          />
        </div>

        <div className="flex flex-col gap-sm">
          <span className="text-sm font-medium text-text-secondary">
            Pin location on map
          </span>

          <div className="relative overflow-hidden rounded-md border border-border-secondary">
            <div ref={mapContainerRef} className="h-[280px] w-full" />

            <PinMarker />
          </div>

          <div className="flex items-center justify-between gap-md">
            <span className="text-sm text-text-tertiary">{formatLatLng(center)}</span>
            <span className="text-sm text-text-tertiary">
              {isLocating ? "Locating…" : mapError ? mapError : "Drag the map to adjust the pin"}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
