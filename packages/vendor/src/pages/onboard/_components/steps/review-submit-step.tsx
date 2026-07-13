import {
  INDUSTRIES,
} from "../constants";
import {
  ReadyToGoLiveBanner,
  ReviewSection,
  SummaryRow,
} from "../shared/review-ui";
import type { StoreSetupState, WizardStep } from "../types";

type ReviewSubmitContentProps = {
  state: StoreSetupState;
  onEdit: (step: WizardStep) => void;
};

export const ReviewSubmitContent = ({ state, onEdit }: ReviewSubmitContentProps) => {
  const { businessDetails, commerce, fulfillmentCentres, payment } = state;

  const industry =
    INDUSTRIES.find((i) => i.value === businessDetails.industry)?.title ?? "—";

  const commerceTypeLabel =
    commerce.commerceType === "local-delivery"
      ? "Local delivery"
      : commerce.commerceType === "ecommerce-shipping"
        ? "Ecommerce shipping"
        : "—";

  const localMethods = commerce.localFulfillment
    .map((m) => (m === "delivery" ? "Delivery" : "Pick-up"))
    .join(" + ");
  const ecomMethods = commerce.ecomFulfillment
    .map((m) => (m === "shipping" ? "Shipping" : "Pickup"))
    .join(" + ");

  const commerceSummary =
    commerce.commerceType === "local-delivery"
      ? `${commerceTypeLabel} - ${localMethods}`
      : commerce.commerceType === "ecommerce-shipping"
        ? `${commerceTypeLabel} - ${ecomMethods}`
        : commerceTypeLabel;

  const activeStatusCount = commerce.orderStatuses.filter((s) => s.active).length;

  const deliveryAreaLabel = commerce.deliveryAreaName || "—";

  const selectedOnlineMethod = payment.onlinePaymentMethods.find(
    (method) => method.isActive,
  );
  const gatewayLabel =
    selectedOnlineMethod?.title ??
    selectedOnlineMethod?.gateway ??
    "—";

  const paymentMethods = payment.methods
    .map((m) => {
      if (m === "online") return `Online payment (${gatewayLabel})`;
      if (m === "cod") return "Cash on delivery";
      return m;
    })
    .join(", ");

  const addressParts = [
    businessDetails.address,
    businessDetails.city,
    businessDetails.state,
    businessDetails.country,
    businessDetails.pinCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col gap-xl">
      <ReviewSection title="Business details" onEdit={() => onEdit(1)}>
        <SummaryRow label="Industry" value={industry} />
        <SummaryRow label="Store name" value={businessDetails.storeName || "—"} />
        <SummaryRow
          label="Business legal name"
          value={businessDetails.businessLegalName || "—"}
        />
        <SummaryRow
          label="Contact"
          value={`${businessDetails.email || "—"}  ·  ${businessDetails.phone || "—"}`}
        />
        <SummaryRow label="Address" value={addressParts || "—"} />
        {businessDetails.taxNumber && (
          <SummaryRow label="GSTIN" value={businessDetails.taxNumber} />
        )}
      </ReviewSection>

      <ReviewSection title="Commerce & orders" onEdit={() => onEdit(2)}>
        <SummaryRow label="Commerce type" value={commerceSummary} />
        <SummaryRow
          label="Active order statuses"
          value={`${activeStatusCount} Statuses enabled`}
        />
        <SummaryRow label="Delivery areas" value={deliveryAreaLabel} />
      </ReviewSection>

      <ReviewSection title="Fulfillment details" onEdit={() => onEdit(3)}>
        <SummaryRow
          label="Fulfillment centres"
          value={`${fulfillmentCentres.length} outlets`}
        />
        <SummaryRow label="Payment methods" value={paymentMethods || "—"} />
      </ReviewSection>

      <ReadyToGoLiveBanner />
    </div>
  );
};
