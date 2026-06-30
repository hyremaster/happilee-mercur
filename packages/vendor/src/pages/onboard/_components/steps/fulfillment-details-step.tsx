import { Edit01, Plus, Trash01 } from "@happilee-app/icons";
import {
  Badge,
  Button,
  CheckboxGroup,
  ExpandableCheckboxCard,
  ExpandableCheckboxCardSection,
  InputField,
  SelectField,
  SelectItem,
} from "@happilee-app/ui";
import { PAYMENT_GATEWAYS } from "../constants";
import type { FulfillmentCentre, PaymentConfig } from "../types";

type FulfillmentDetailsStepProps = {
  centres: FulfillmentCentre[];
  payment: PaymentConfig;
  onPaymentChange: (patch: Partial<PaymentConfig>) => void;
  onDeleteCentre: (id: string) => void;
  codError?: string;
};

export function isFulfillmentValid(
  centres: FulfillmentCentre[],
  payment: PaymentConfig,
) {
  if (centres.length === 0) return false;
  if (payment.methods.length === 0) return false;
  if (payment.methods.includes("online") && !payment.paymentGateway) return false;

  if (payment.methods.includes("cod")) {
    const min = parseFloat(payment.codMin);
    const max = parseFloat(payment.codMax);
    if (payment.codMin && payment.codMax && !Number.isNaN(min) && !Number.isNaN(max) && min > max) {
      return false;
    }
  }

  return true;
}

export function getCodError(payment: PaymentConfig) {
  if (!payment.methods.includes("cod")) return undefined;
  const min = parseFloat(payment.codMin);
  const max = parseFloat(payment.codMax);
  if (payment.codMin && payment.codMax && !Number.isNaN(min) && !Number.isNaN(max) && min > max) {
    return "Minimum value cannot exceed maximum value";
  }
  return undefined;
}

export const FulfillmentDetailsStep = ({
  centres,
  payment,
  onPaymentChange,
  onDeleteCentre,
  codError,
}: FulfillmentDetailsStepProps) => {
  return (
    <div className="flex w-full flex-col items-start gap-4xl">
      <div className="flex w-full flex-col gap-lg">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-xxs text-sm font-medium text-text-secondary">
            <span>Fulfillment centres</span>
            <span className="text-text-brand" aria-hidden="true">*</span>
          </div>
          <Button hierarchy="primary" size="sm" iconTrailing={<Plus />}>
            Add new location
          </Button>
        </div>

        <div className="flex flex-col divide-y divide-border-secondary overflow-hidden rounded-md border border-border-secondary">
          {centres.map((centre) => (
            <div
              key={centre.id}
              className="flex items-center justify-between bg-bg-primary px-xl py-lg"
            >
              <div className="flex flex-col gap-xxs">
                <div className="flex items-center gap-sm">
                  <span className="text-sm font-semibold text-text-primary">{centre.name}</span>
                  <Badge color={centre.active ? "success" : "error"} withDot size="sm">
                    {centre.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <span className="text-sm text-text-tertiary">{centre.address}</span>
              </div>
              <div className="flex shrink-0 items-center gap-xs">
                <Button
                  hierarchy="ghost"
                  size="sm"
                  iconOnly
                  iconLeading={<Trash01 size={16} />}
                  aria-label="Delete"
                  className="text-fg-quaternary"
                  onPress={() => onDeleteCentre(centre.id)}
                />
                <Button
                  hierarchy="ghost"
                  size="sm"
                  iconOnly
                  iconLeading={<Edit01 size={16} />}
                  aria-label="Edit"
                  className="text-fg-quaternary"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col gap-lg">
        <div className="flex items-center gap-xxs text-sm font-medium text-text-secondary">
          <span>Choose Payment method</span>
          <span className="text-text-brand" aria-hidden="true">*</span>
        </div>

        <CheckboxGroup
          aria-label="Payment method"
          value={payment.methods}
          onChange={(value) => onPaymentChange({ methods: value as string[] })}
          className="flex w-full flex-col gap-md"
        >
          <ExpandableCheckboxCard
            value="online"
            title="Online payment"
            description="Accept UPI, cards, netbanking, and wallets via your connected payment gateway."
            indicator="radio"
          >
            <ExpandableCheckboxCardSection label="Payment gateway" isRequired>
              <SelectField
                aria-label="Choose payment gateway"
                placeholder="Choose payment gateway"
                size="sm"
                selectedKey={payment.paymentGateway || undefined}
                onSelectionChange={(key) =>
                  onPaymentChange({ paymentGateway: String(key ?? "") })
                }
              >
                {PAYMENT_GATEWAYS.map((gw) => (
                  <SelectItem key={gw.id} id={gw.id}>
                    {gw.label}
                  </SelectItem>
                ))}
              </SelectField>
              <div className="flex items-center gap-xxs text-sm text-text-tertiary">
                <span>Don&apos;t see your payment gateway?</span>
                <span className="cursor-pointer text-text-brand underline">
                  Add new payment gateway
                </span>
              </div>
            </ExpandableCheckboxCardSection>
          </ExpandableCheckboxCard>

          <ExpandableCheckboxCard
            value="cod"
            title="Cash on delivery"
            description="Customer pays in cash or by card when the order is delivered."
            indicator="radio"
          >
            <div className="grid grid-cols-2 gap-md">
              <InputField
                label="Minimum order value"
                placeholder="Enter value"
                size="sm"
                value={payment.codMin}
                onChange={(v) => onPaymentChange({ codMin: v })}
              />
              <InputField
                label="Maximum order value"
                placeholder="Enter value"
                size="sm"
                value={payment.codMax}
                onChange={(v) => onPaymentChange({ codMax: v })}
                errorMessage={codError}
                isInvalid={!!codError}
              />
            </div>
          </ExpandableCheckboxCard>
        </CheckboxGroup>
      </div>
    </div>
  );
};
