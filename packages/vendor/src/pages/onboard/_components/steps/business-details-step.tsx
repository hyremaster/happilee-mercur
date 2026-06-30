import { Mail01 } from "@happilee-app/icons";
import { InputField, RadioCard, RadioCardGroup, Textarea } from "@happilee-app/ui";
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
              placeholder="e.g. GreenMart"
              size="md"
              value={data.storeName}
              onChange={(v) => onChange({ storeName: v })}
            />
            <InputField
              label="Business Legal Name"
              isRequired
              placeholder="e.g. GreenMart"
              size="md"
              value={data.businessLegalName}
              onChange={(v) => onChange({ businessLegalName: v })}
            />
          </div>

          <div className="grid w-full grid-cols-2 gap-lg">
            <InputField
              label="Email"
              isRequired
              placeholder="store@example.com"
              iconLeading={<Mail01 />}
              size="md"
              value={data.email}
              onChange={(v) => onChange({ email: v })}
            />
            <InputField
              label="Phone Number"
              isRequired
              placeholder="+91 98765 43210"
              size="md"
              value={data.phone}
              onChange={(v) => onChange({ phone: v })}
            />
          </div>

          <Textarea
            label="Address"
            isRequired
            placeholder="123 Commerce Street, Floor 4"
            rows={3}
            className="w-full"
            value={data.address}
            onChange={(v) => onChange({ address: v })}
          />

          <div className="grid w-full grid-cols-4 gap-lg">
            <InputField
              label="Country"
              isRequired
              placeholder="India"
              size="md"
              value={data.country}
              onChange={(v) => onChange({ country: v })}
            />
            <InputField
              label="State"
              isRequired
              placeholder="Maharashtra"
              size="md"
              value={data.state}
              onChange={(v) => onChange({ state: v })}
            />
            <InputField
              label="City"
              isRequired
              placeholder="Mumbai"
              size="md"
              value={data.city}
              onChange={(v) => onChange({ city: v })}
            />
            <InputField
              label="Pincode"
              isRequired
              placeholder="400001"
              size="md"
              value={data.pinCode}
              onChange={(v) => onChange({ pinCode: v })}
            />
          </div>

          <InputField
            label="Tax/GST number"
            placeholder="27AAACC1234B1Z5"
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
