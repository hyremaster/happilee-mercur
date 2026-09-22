import { useMemo } from "react";
import { InputField, SelectField, SelectItem } from "@happilee-app/ui";

import { countries, getCountryByIso2 } from "../../../lib/data/countries";
import { getCountryProvinceObjectByIso2 } from "../../../lib/data/country-states";

type FieldSize = "sm" | "md";

export function resolveCountryIso2(value: string): string | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const byIso = getCountryByIso2(trimmed);

  if (byIso) {
    return byIso.iso_2.toLowerCase();
  }

  const normalized = trimmed.toLowerCase();
  const byName = countries.find(
    (entry) =>
      entry.display_name.toLowerCase() === normalized ||
      entry.name.toLowerCase() === normalized,
  );

  return byName?.iso_2.toLowerCase();
}

function resolveCountryDisplayName(iso2: string): string {
  return getCountryByIso2(iso2)?.display_name ?? iso2;
}

type CountrySelectFieldProps = {
  label?: string;
  isRequired?: boolean;
  placeholder?: string;
  size?: FieldSize;
  value: string;
  onChange: (country: string) => void;
};

export function CountrySelectField({
  label,
  isRequired,
  placeholder,
  size = "md",
  value,
  onChange,
}: CountrySelectFieldProps) {
  const sortedCountries = useMemo(
    () =>
      [...countries].sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      ),
    [],
  );

  const selectedIso2 = resolveCountryIso2(value);
  const valueMissingFromList = !!value.trim() && !selectedIso2;

  return (
    <SelectField
      label={label}
      isRequired={isRequired}
      placeholder={placeholder ?? "Select country"}
      size={size}
      selectedKey={selectedIso2}
      onSelectionChange={(key) => {
        if (key == null) {
          return;
        }

        onChange(resolveCountryDisplayName(String(key)));
      }}
    >
      {valueMissingFromList && (
        <SelectItem id={value} textValue={value}>
          {value}
        </SelectItem>
      )}
      {sortedCountries.map((country) => (
        <SelectItem
          key={country.iso_2}
          id={country.iso_2.toLowerCase()}
          textValue={country.display_name}
        >
          {country.display_name}
        </SelectItem>
      ))}
    </SelectField>
  );
}

type StateSelectFieldProps = {
  label?: string;
  isRequired?: boolean;
  placeholder?: string;
  size?: FieldSize;
  country: string;
  value: string;
  onChange: (state: string) => void;
};

export function StateSelectField({
  label,
  isRequired,
  placeholder,
  size = "md",
  country,
  value,
  onChange,
}: StateSelectFieldProps) {
  const countryIso2 = resolveCountryIso2(country);
  const provinceObject = useMemo(
    () => getCountryProvinceObjectByIso2(countryIso2 ?? null),
    [countryIso2],
  );

  const provinces = useMemo(() => {
    if (!provinceObject) {
      return [];
    }

    return Object.entries(provinceObject.options)
      .map(([code, name]) => ({ code: code.toLowerCase(), name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [provinceObject]);

  const valueMissingFromList =
    !!value.trim() &&
    provinces.length > 0 &&
    !provinces.some((province) => province.name === value);

  if (provinces.length === 0) {
    return (
      <InputField
        label={label}
        isRequired={isRequired}
        placeholder={placeholder ?? "Enter state"}
        size={size}
        value={value}
        isDisabled={!country.trim()}
        onChange={onChange}
      />
    );
  }

  return (
    <SelectField
      label={label}
      isRequired={isRequired}
      placeholder={placeholder ?? "Select state"}
      size={size}
      isDisabled={!countryIso2}
      selectedKey={value || undefined}
      onSelectionChange={(key) => {
        if (key == null) {
          return;
        }

        onChange(String(key));
      }}
    >
      {valueMissingFromList && (
        <SelectItem id={value} textValue={value}>
          {value}
        </SelectItem>
      )}
      {provinces.map((province) => (
        <SelectItem
          key={province.code}
          id={province.name}
          textValue={province.name}
        >
          {province.name}
        </SelectItem>
      ))}
    </SelectField>
  );
}
