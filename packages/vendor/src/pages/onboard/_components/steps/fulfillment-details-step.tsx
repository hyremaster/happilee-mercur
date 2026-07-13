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
import { formatFulfillmentCentreAddress } from "../onboarding-mappers";
import type { FulfillmentCentre, PaymentConfig } from "../types";

const sanitizePositiveAmountInput = (value: string): string => {
  let sanitized = value.replace(/[^\d.]/g, "");
  const dotIndex = sanitized.indexOf(".");

  if (dotIndex !== -1) {
    sanitized =
      sanitized.slice(0, dotIndex + 1) +
      sanitized.slice(dotIndex + 1).replace(/\./g, "");
  }

  return sanitized;
};

const parsePositiveAmount = (value: string): number | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const amount = Number.parseFloat(trimmed);

  if (Number.isNaN(amount) || amount <= 0) {
    return null;
  }

  return amount;
};

type FulfillmentDetailsStepProps = {
  centres: FulfillmentCentre[];
  payment: PaymentConfig;
  onPaymentChange: (patch: Partial<PaymentConfig>) => void;
  onDeleteCentre: (id: string) => void;
  onAddLocation?: () => void;
  onEditCentre?: (centre: FulfillmentCentre) => void;
};

export function isFulfillmentValid(
  centres: FulfillmentCentre[],
  payment: PaymentConfig,
) {
  if (centres.length === 0) return false;
  if (payment.methods.length === 0) return false;
  if (payment.methods.includes("online") && !payment.paymentGateway)
    return false;

  if (payment.methods.includes("cod")) {
    const min = parsePositiveAmount(payment.codMin);
    const max = parsePositiveAmount(payment.codMax);

    if (min === null || max === null || max <= min) {
      return false;
    }
  }

  return true;
}

export function getCodMinError(payment: PaymentConfig) {
  if (!payment.methods.includes("cod")) {
    return undefined;
  }

  if (payment.codMin.trim() && parsePositiveAmount(payment.codMin) === null) {
    return "Enter a positive number";
  }

  return undefined;
}

export function getCodMaxError(payment: PaymentConfig) {
  if (!payment.methods.includes("cod")) {
    return undefined;
  }

  if (payment.codMax.trim() && parsePositiveAmount(payment.codMax) === null) {
    return "Enter a positive number";
  }

  const min = parsePositiveAmount(payment.codMin);
  const max = parsePositiveAmount(payment.codMax);

  if (min !== null && max !== null && max <= min) {
    return "Maximum must be greater than minimum";
  }

  return undefined;
}

export const FulfillmentDetailsStep = ({
  centres,
  payment,
  onPaymentChange,
  onDeleteCentre,
  onAddLocation,
  onEditCentre,
}: FulfillmentDetailsStepProps) => {
  const codMinError = getCodMinError(payment);
  const codMaxError = getCodMaxError(payment);

  return (
    <div className="flex w-full flex-col items-start gap-4xl">
      <div className="flex w-full flex-col gap-lg">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-xxs text-sm font-medium text-text-secondary">
            <span>Fulfillment centres</span>
            <span className="text-text-brand" aria-hidden="true">
              *
            </span>
          </div>
          <Button
            hierarchy="primary"
            size="sm"
            iconTrailing={<Plus />}
            onPress={onAddLocation}
          >
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
                  <span className="text-sm font-semibold text-text-primary">
                    {centre.name}
                  </span>
                  <Badge
                    color={centre.active ? "success" : "error"}
                    withDot
                    size="sm"
                  >
                    {centre.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <span className="text-sm text-text-tertiary">
                  {formatFulfillmentCentreAddress(centre)}
                </span>
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
                  onPress={() => onEditCentre?.(centre)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col gap-lg">
        <div className="flex items-center gap-xxs text-sm font-medium text-text-secondary">
          <span>Choose Payment method</span>
          <span className="text-text-brand" aria-hidden="true">
            *
          </span>
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
                aria-label="Choose payment method name"
                placeholder="Choose payment method name"
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
                isRequired
                inputMode="decimal"
                value={payment.codMin}
                onChange={(v) =>
                  onPaymentChange({
                    codMin: sanitizePositiveAmountInput(v),
                  })
                }
                isInvalid={!!codMinError}
                errorMessage={codMinError}
              />
              <InputField
                label="Maximum order value"
                placeholder="Enter value"
                size="sm"
                isRequired
                inputMode="decimal"
                value={payment.codMax}
                onChange={(v) =>
                  onPaymentChange({
                    codMax: sanitizePositiveAmountInput(v),
                  })
                }
                isInvalid={!!codMaxError}
                errorMessage={codMaxError}
              />
            </div>
          </ExpandableCheckboxCard>
        </CheckboxGroup>
      </div>
    </div>
  );
};
