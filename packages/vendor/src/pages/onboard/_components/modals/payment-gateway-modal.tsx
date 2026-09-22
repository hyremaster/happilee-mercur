/**
 * PaymentGatewayModal — add / edit payment gateway form modal
 *
 * Razorpay-only for now. Composed from @happilee-app/ui + @happilee-app/icons.
 */

import { Check } from "@happilee-app/icons";
import { Button, InputField, Modal, SelectField, SelectItem } from "@happilee-app/ui";
import { useEffect, useState } from "react";
import {
  clampFieldLength,
  FIELD_LIMIT_PAYMENT_CREDENTIAL,
  FIELD_LIMIT_PAYMENT_METHOD_NAME,
} from "../field-limits";

export type PaymentGatewayFormValues = {
  methodName: string;
  gateway: string;
  keyId: string;
  keySecret: string;
};

export type PaymentGatewayModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  initialValues?: Partial<PaymentGatewayFormValues>;
  onSave?: (values: PaymentGatewayFormValues) => void;
};

const DEFAULT_GATEWAY = "razorpay";

export function PaymentGatewayModal({
  isOpen,
  onOpenChange,
  mode,
  initialValues,
  onSave,
}: PaymentGatewayModalProps) {
  const [methodName, setMethodName] = useState("");
  const [gateway, setGateway] = useState<string | null>(DEFAULT_GATEWAY);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setMethodName(initialValues?.methodName ?? "");
    setGateway(initialValues?.gateway ?? DEFAULT_GATEWAY);
    setKeyId(initialValues?.keyId ?? "");
    setKeySecret(initialValues?.keySecret ?? "");
    setSubmitAttempted(false);
  }, [isOpen, initialValues]);

  const title =
    mode === "add" ? "Add new payment gateway" : "Edit payment gateway";

  const isMethodNameValid = methodName.trim().length > 0;
  const isGatewayValid = !!gateway;
  const isKeyIdValid = keyId.trim().length > 0;
  const isKeySecretValid = keySecret.trim().length > 0;
  const canSubmit =
    isMethodNameValid && isGatewayValid && isKeyIdValid && isKeySecretValid;

  function handleSave() {
    if (!canSubmit) {
      setSubmitAttempted(true);
      return;
    }

    onSave?.({
      methodName,
      gateway: gateway ?? DEFAULT_GATEWAY,
      keyId,
      keySecret,
    });
    onOpenChange(false);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      size="xl"
      footerVariant="plain"
      footer={
        <>
          <Button hierarchy="secondary" size="md" onPress={handleCancel}>
            Cancel
          </Button>
          <Button
            hierarchy="primary"
            size="md"
            iconTrailing={<Check />}
            onPress={handleSave}
            isDisabled={submitAttempted && !canSubmit}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-xl gap-y-xl">
        <InputField
          label="Payment method name"
          isRequired
          placeholder="Enter Payment name"
          value={methodName}
          onChange={(v) =>
            setMethodName(clampFieldLength(v, FIELD_LIMIT_PAYMENT_METHOD_NAME))
          }
          errorMessage={
            submitAttempted && !isMethodNameValid
              ? "Payment method name is required"
              : undefined
          }
        />
        <SelectField
          label="Payment gateway"
          isRequired
          placeholder="Select gateway"
          selectedKey={gateway}
          onSelectionChange={(key) =>
            setGateway(key != null ? String(key) : null)
          }
          errorMessage={
            submitAttempted && !isGatewayValid
              ? "Payment gateway is required"
              : undefined
          }
        >
          <SelectItem id="razorpay">Razorpay</SelectItem>
        </SelectField>
        <InputField
          label="Razorpay key ID"
          isRequired
          placeholder="Enter unique ID"
          value={keyId}
          onChange={(v) =>
            setKeyId(clampFieldLength(v, FIELD_LIMIT_PAYMENT_CREDENTIAL))
          }
          errorMessage={
            submitAttempted && !isKeyIdValid
              ? "Razorpay key ID is required"
              : undefined
          }
        />
        <InputField
          label="Razorpay secret code"
          isRequired
          placeholder="Enter here"
          value={keySecret}
          onChange={(v) =>
            setKeySecret(clampFieldLength(v, FIELD_LIMIT_PAYMENT_CREDENTIAL))
          }
          errorMessage={
            submitAttempted && !isKeySecretValid
              ? "Razorpay secret code is required"
              : undefined
          }
        />
      </div>
    </Modal>
  );
}
