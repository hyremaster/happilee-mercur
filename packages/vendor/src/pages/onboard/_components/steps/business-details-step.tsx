import { Mail01 } from "@happilee-app/icons";
import {
  InputField,
  PhoneNumberInput,
  type PhoneNumberValue,
  RadioCard,
  RadioCardGroup,
  Textarea,
} from "@happilee-app/ui";
import {
  CountrySelectField,
  resolveCountryIso2,
  StateSelectField,
} from "../address-select-fields";
import { INDUSTRIES } from "../constants";
import type { BusinessDetails } from "../types";

type BusinessDetailsStepProps = {
  data: BusinessDetails;
  onChange: (patch: Partial<BusinessDetails>) => void;
};

export const BusinessDetailsStep = ({
  data,
  onChange,
}: BusinessDetailsStepProps) => {
  return (
    <div className="flex w-full flex-col items-start gap-4xl">
      <div className="flex w-full flex-col gap-md">
        <div className="flex items-center gap-xs text-sm font-medium leading-5">
          <span className="text-text-secondary">Pick your industry</span>
          <span className="text-text-brand" aria-hidden="true">*</span>
        </div>
        <RadioCardGroup
          columns={3}
          aria-label="Pick your industry"
          className="w-full"
          value={data.industry}
          onChange={(value) => onChange({ industry: value })}
        >
          {INDUSTRIES.map((ind) => (
            <RadioCard
              key={ind.value}
              value={ind.value}
              icon={ind.icon}
              title={ind.title}
              description={ind.description}
            />
          ))}
        </RadioCardGroup>
      </div>

      <div className="flex w-full flex-col items-start gap-2xl">
        <span className="text-lg font-semibold leading-7 text-text-primary">
          Store details
        </span>
        <div className="flex w-full flex-col gap-2xl">
          <div className="grid w-full grid-cols-2 gap-[20px]">
            <InputField
              label="Store Name"
              isRequired
              placeholder="Store name"
              size="md"
              value={data.storeName}
              onChange={(v) => onChange({ storeName: v })}
            />
            <InputField
              label="Business Legal Name"
              isRequired
              placeholder="Business legal name"
              size="md"
              value={data.businessLegalName}
              onChange={(v) => onChange({ businessLegalName: v })}
            />
          </div>

          <div className="grid w-full grid-cols-2 gap-lg">
            <InputField
              label="Email"
              isRequired
              placeholder="Email"
              iconLeading={<Mail01 />}
              size="md"
              value={data.email}
              onChange={(v) => onChange({ email: v })}
            />
            <PhoneNumberInput
              label="Phone Number"
              isRequired
              placeholder="Phone number"
              size="md"
              defaultCountry="IN"
              value={data.phone}
              onChange={(v: PhoneNumberValue | undefined) =>
                onChange({ phone: v ?? "" })
              }
            />
          </div>

          <Textarea
            label="Address"
            isRequired
            placeholder="Address"
            rows={3}
            className="w-full"
            value={data.address}
            onChange={(v) => onChange({ address: v })}
          />

          <div className="grid w-full grid-cols-4 gap-lg">
            <CountrySelectField
              label="Country"
              isRequired
              placeholder="Select country"
              size="md"
              value={data.country}
              onChange={(country) => {
                const previousIso2 = resolveCountryIso2(data.country);
                const nextIso2 = resolveCountryIso2(country);

                onChange({
                  country,
                  ...(previousIso2 !== nextIso2 ? { state: "" } : {}),
                });
              }}
            />
            <StateSelectField
              label="State"
              isRequired
              placeholder="Select state"
              size="md"
              country={data.country}
              value={data.state}
              onChange={(state) => onChange({ state })}
            />
            <InputField
              label="City"
              isRequired
              placeholder="City"
              size="md"
              value={data.city}
              onChange={(v) => onChange({ city: v })}
            />
            <InputField
              label="Pincode"
              isRequired
              placeholder="Pincode"
              size="md"
              value={data.pinCode}
              onChange={(v) => onChange({ pinCode: v })}
            />
          </div>

          <InputField
            label="Tax/GST number"
            isRequired
            placeholder="Tax/GST number"
            size="md"
            className="w-full"
            value={data.taxNumber}
            onChange={(v) => onChange({ taxNumber: v })}
          />
        </div>
      </div>
    </div>
  );
};
