import { Edit01, Plus, Trash01 } from "@happilee-app/icons";
import {
  Badge,
  Button,
  CheckboxGroup,
  ExpandableCheckboxCard,
  InputField,
  PaymentMethodRadioCard,
  PaymentMethodRadioCardGroup,
} from "@happilee-app/ui";
import { useState } from "react";
import {
  PaymentGatewayModal,
  type PaymentGatewayFormValues,
} from "../modals/payment-gateway-modal";
import { formatFulfillmentCentreAddress } from "../onboarding-mappers";
import type {
  FulfillmentCentre,
  OnlinePaymentMethod,
  PaymentConfig,
} from "../types";

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

const formatGatewayLabel = (gateway: string) => {
  if (!gateway) return gateway;
  return gateway.charAt(0).toUpperCase() + gateway.slice(1);
};

const createPaymentMethodId = () => {
  const cryptoAny = crypto as unknown as Partial<{ randomUUID: () => string }>;
  if (cryptoAny.randomUUID) return cryptoAny.randomUUID();
  return `pm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

/** Ensure exactly one primary (`isActive`) gateway when the list is non-empty. */
function withPrimarySelection(
  methods: OnlinePaymentMethod[],
  primaryId: string,
): OnlinePaymentMethod[] {
  if (methods.length === 0) return methods;

  const resolvedPrimaryId =
    methods.find((method) => method.id === primaryId)?.id ?? methods[0]?.id;

  return methods.map((method) => ({
    ...method,
    isActive: method.id === resolvedPrimaryId,
  }));
}

type PaymentGatewayModalState =
  | { open: false }
  | { open: true; mode: "add" }
  | { open: true; mode: "edit"; paymentMethodId: string };

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

  if (payment.methods.includes("online")) {
    if (payment.onlinePaymentMethods.length === 0) return false;
    if (!payment.onlinePaymentMethods.some((method) => method.isActive)) {
      return false;
    }
  }

  if (payment.methods.includes("cod")) {
    if (getCodMinError(payment) || getCodMaxError(payment)) {
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
  const [paymentGatewayModal, setPaymentGatewayModal] =
    useState<PaymentGatewayModalState>({ open: false });

  const selectedOnlinePaymentMethodId =
    payment.onlinePaymentMethods.find((method) => method.isActive)?.id ?? "";

  const editingPaymentMethod =
    paymentGatewayModal.open && paymentGatewayModal.mode === "edit"
      ? payment.onlinePaymentMethods.find(
          (method) => method.id === paymentGatewayModal.paymentMethodId,
        )
      : undefined;

  function openAddPaymentGatewayModal() {
    setPaymentGatewayModal({ open: true, mode: "add" });
  }

  function openEditPaymentGatewayModal(paymentMethodId: string) {
    setPaymentGatewayModal({ open: true, mode: "edit", paymentMethodId });
  }

  function handlePaymentGatewaySave(values: PaymentGatewayFormValues) {
    const gatewayLabel = formatGatewayLabel(values.gateway);
    const credentials = {
      methodName: values.methodName,
      gateway: values.gateway,
      keyId: values.keyId,
      keySecret: values.keySecret,
    };

    if (paymentGatewayModal.open && paymentGatewayModal.mode === "edit") {
      const nextMethods = payment.onlinePaymentMethods.map((method) =>
        method.id === paymentGatewayModal.paymentMethodId
          ? {
              ...method,
              title: values.methodName,
              gateway: gatewayLabel,
              credentials,
            }
          : method,
      );

      onPaymentChange({
        onlinePaymentMethods: withPrimarySelection(
          nextMethods,
          selectedOnlinePaymentMethodId,
        ),
      });
      return;
    }

    const newMethod: OnlinePaymentMethod = {
      id: createPaymentMethodId(),
      title: values.methodName,
      gateway: gatewayLabel,
      isActive: payment.onlinePaymentMethods.length === 0,
      credentials,
    };
    const nextMethods = [...payment.onlinePaymentMethods, newMethod];

    onPaymentChange({
      onlinePaymentMethods: withPrimarySelection(
        nextMethods,
        selectedOnlinePaymentMethodId || newMethod.id,
      ),
    });
  }

  function handleDeletePaymentMethod(paymentMethodId: string) {
    const nextMethods = payment.onlinePaymentMethods.filter(
      (method) => method.id !== paymentMethodId,
    );
    const nextPrimaryId =
      selectedOnlinePaymentMethodId === paymentMethodId
        ? (nextMethods[0]?.id ?? "")
        : selectedOnlinePaymentMethodId;

    onPaymentChange({
      onlinePaymentMethods: withPrimarySelection(nextMethods, nextPrimaryId),
    });
  }

  function handleSelectPaymentMethod(paymentMethodId: string) {
    onPaymentChange({
      onlinePaymentMethods: withPrimarySelection(
        payment.onlinePaymentMethods,
        paymentMethodId,
      ),
    });
  }

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
            {payment.onlinePaymentMethods.length > 0 && (
              <PaymentMethodRadioCardGroup
                aria-label="Payment gateway"
                value={selectedOnlinePaymentMethodId || undefined}
                onChange={handleSelectPaymentMethod}
              >
                {payment.onlinePaymentMethods.map((method) => (
                  <PaymentMethodRadioCard
                    key={method.id}
                    value={method.id}
                    title={method.title}
                    gateway={method.gateway}
                    actions={
                      <>
                        <Button
                          hierarchy="ghost"
                          size="sm"
                          iconOnly
                          iconLeading={<Edit01 size={16} />}
                          aria-label="Edit payment method"
                          className="text-fg-brand"
                          onPress={() => openEditPaymentGatewayModal(method.id)}
                        />
                        {!method.isActive ? (
                          <Button
                            hierarchy="ghost-destructive"
                            size="sm"
                            iconOnly
                            iconLeading={<Trash01 size={16} />}
                            aria-label="Delete payment method"
                            onPress={() => handleDeletePaymentMethod(method.id)}
                          />
                        ) : null}
                      </>
                    }
                  />
                ))}
              </PaymentMethodRadioCardGroup>
            )}
            <Button
              hierarchy="secondary"
              size="sm"
              iconLeading={<Plus />}
              className="w-fit"
              onPress={openAddPaymentGatewayModal}
            >
              Add payment gateway
            </Button>
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

      <PaymentGatewayModal
        isOpen={paymentGatewayModal.open}
        onOpenChange={(open) => {
          if (!open) setPaymentGatewayModal({ open: false });
        }}
        mode={paymentGatewayModal.open ? paymentGatewayModal.mode : "add"}
        initialValues={
          paymentGatewayModal.open && paymentGatewayModal.mode === "edit"
            ? editingPaymentMethod?.credentials
            : undefined
        }
        onSave={handlePaymentGatewaySave}
      />
    </div>
  );
};
