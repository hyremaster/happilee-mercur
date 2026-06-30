import { Edit01 } from "@happilee-app/icons";
import { Button } from "@happilee-app/ui";
import { DELIVERY_AREAS, INDUSTRIES, PAYMENT_GATEWAYS, STOREFRONT_TEMPLATES } from "../constants";
import type { StoreSetupState, WizardStep } from "../types";

type ReviewSubmitStepProps = {
  state: StoreSetupState;
  onEdit: (step: WizardStep) => void;
};

const ReviewSection = ({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) => (
  <div className="flex w-full flex-col gap-sm rounded-md border border-border-secondary p-xl">
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-text-primary">{title}</span>
      <Button hierarchy="ghost" size="sm" iconLeading={<Edit01 size={16} />} onPress={onEdit}>
        Edit
      </Button>
    </div>
    <div className="flex flex-col gap-xs text-sm text-text-secondary">{children}</div>
  </div>
);

export const ReviewSubmitStep = ({ state, onEdit }: ReviewSubmitStepProps) => {
  const { businessDetails, commerce, fulfillmentCentres, payment, storefront } = state;

  const industry = INDUSTRIES.find((i) => i.value === businessDetails.industry)?.title ?? "—";
  const deliveryArea =
    DELIVERY_AREAS.find((a) => a.id === commerce.deliveryArea)?.label ?? "—";
  const gateway =
    PAYMENT_GATEWAYS.find((g) => g.id === payment.paymentGateway)?.label ?? "—";
  const template =
    STOREFRONT_TEMPLATES.find((t) => t.id === storefront.template)?.label ?? "—";

  const commerceLabel =
    commerce.commerceType === "local-delivery" ? "Local delivery" : "Ecommerce shipping";

  const paymentMethods = payment.methods
    .map((m) => (m === "online" ? "Online Payment" : "Cash on Delivery"))
    .join(", ");

  const activeStatuses = commerce.orderStatuses
    .filter((s) => s.active)
    .map((s) => s.displayName)
    .join(", ");

  return (
    <div className="flex w-full flex-col gap-lg">
      <ReviewSection title="Business Details" onEdit={() => onEdit(0)}>
        <span>Industry: {industry}</span>
        <span>Store: {businessDetails.storeName}</span>
        <span>Legal name: {businessDetails.businessLegalName}</span>
        <span>Email: {businessDetails.email}</span>
        <span>Phone: {businessDetails.phone}</span>
        <span>
          Address: {businessDetails.address}, {businessDetails.city},{" "}
          {businessDetails.state}, {businessDetails.country} — {businessDetails.pinCode}
        </span>
        {businessDetails.taxNumber && <span>Tax/GST: {businessDetails.taxNumber}</span>}
      </ReviewSection>

      <ReviewSection title="Store URL Handle" onEdit={() => onEdit(3)}>
        <span>commerce.happilee.io/stores/{storefront.handle}</span>
        <span>Template: {template}</span>
      </ReviewSection>

      <ReviewSection title="Commerce Type" onEdit={() => onEdit(1)}>
        <span>{commerceLabel}</span>
        <span>
          Fulfillment:{" "}
          {commerce.commerceType === "local-delivery"
            ? commerce.localFulfillment.join(", ")
            : commerce.ecomFulfillment.join(", ")}
        </span>
        <span>Delivery area: {deliveryArea}</span>
      </ReviewSection>

      <ReviewSection title="Payment Types" onEdit={() => onEdit(2)}>
        <span>{paymentMethods || "—"}</span>
        {payment.methods.includes("online") && <span>Gateway: {gateway}</span>}
        {payment.methods.includes("cod") && (
          <span>
            COD range: {payment.codMin || "—"} – {payment.codMax || "—"}
          </span>
        )}
      </ReviewSection>

      <ReviewSection title="Order Status Configuration" onEdit={() => onEdit(1)}>
        <span>{activeStatuses || "—"}</span>
      </ReviewSection>

      <ReviewSection title="Fulfillment Centres" onEdit={() => onEdit(2)}>
        {fulfillmentCentres.map((c) => (
          <span key={c.id}>
            {c.name} ({c.active ? "Active" : "Inactive"}) — {c.address}
          </span>
        ))}
      </ReviewSection>

      <ReviewSection title="Delivery Areas" onEdit={() => onEdit(1)}>
        <span>{deliveryArea}</span>
      </ReviewSection>
    </div>
  );
};
