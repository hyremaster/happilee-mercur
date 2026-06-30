import { RefreshCw01 } from "@happilee-app/icons";
import {
  Button,
  CheckboxCard,
  CheckboxCardGroup,
  ExpandableRadioCard,
  ExpandableRadioCardSection,
  InputField,
  RadioGroup,
  SelectField,
  SelectItem,
  StatusDot,
  Table,
  TableBody,
  TableHeader,
  Column,
  Row,
  Cell,
  Toggle,
} from "@happilee-app/ui";
import { DELIVERY_AREAS } from "../constants";
import type { CommerceConfig } from "../types";

type CommerceTypeStepProps = {
  data: CommerceConfig;
  onChange: (patch: Partial<CommerceConfig>) => void;
  onResetStatuses: () => void;
  onUpdateStatus: (id: string, patch: { displayName?: string; active?: boolean }) => void;
};

export function isCommerceTypeValid(data: CommerceConfig) {
  if (!data.commerceType) return false;

  const fulfillment =
    data.commerceType === "local-delivery"
      ? data.localFulfillment
      : data.ecomFulfillment;

  if (fulfillment.length === 0) return false;

  const needsArea =
    data.commerceType === "local-delivery"
      ? data.localFulfillment.includes("delivery")
      : data.ecomFulfillment.includes("shipping");

  if (needsArea && !data.deliveryArea) return false;

  return true;
}

export const CommerceTypeStep = ({
  data,
  onChange,
  onResetStatuses,
  onUpdateStatus,
}: CommerceTypeStepProps) => {
  return (
    <div className="flex w-full flex-col items-start gap-4xl">
      <div className="flex w-full flex-col gap-md">
        <RadioGroup
          aria-label="Commerce type"
          value={data.commerceType}
          onChange={(value) =>
            onChange({ commerceType: value as CommerceConfig["commerceType"] })
          }
          itemsClassName="gap-md w-full"
        >
          <ExpandableRadioCard
            value="local-delivery"
            title="Local delivery"
            description="Best for restaurants, grocery, pharmacy, and hyperlocal businesses that fulfill within a city or area."
          >
            <ExpandableRadioCardSection label="Choose how you fulfill" isRequired>
              <CheckboxCardGroup
                aria-label="Choose how you fulfill"
                value={data.localFulfillment}
                onChange={(value) => onChange({ localFulfillment: value as string[] })}
              >
                <CheckboxCard
                  value="delivery"
                  title="Delivery"
                  description="Your delivery partners drop orders at the customer."
                />
                <CheckboxCard
                  value="pickup"
                  title="Pick-up"
                  description="Customers collect orders directly from your outlet."
                />
              </CheckboxCardGroup>

              {data.localFulfillment.includes("delivery") && (
                <div className="flex flex-col gap-xs">
                  <div className="flex items-center gap-xxs text-sm font-medium text-text-secondary">
                    <span>Delivery available areas (from your </span>
                    <span className="cursor-pointer text-text-brand underline">Area Sense</span>
                    <span> module)</span>
                    <span className="text-text-brand" aria-hidden="true">*</span>
                  </div>
                  <SelectField
                    aria-label="Choose from saved locations"
                    placeholder="Choose from saved locations"
                    size="sm"
                    selectedKey={data.deliveryArea || undefined}
                    onSelectionChange={(key) =>
                      onChange({ deliveryArea: String(key ?? "") })
                    }
                  >
                    {DELIVERY_AREAS.map((area) => (
                      <SelectItem key={area.id} id={area.id}>
                        {area.label}
                      </SelectItem>
                    ))}
                  </SelectField>
                </div>
              )}
            </ExpandableRadioCardSection>
          </ExpandableRadioCard>

          <ExpandableRadioCard
            value="ecommerce-shipping"
            title="Ecommerce shipping"
            description="Best for fashion, electronics, beauty, and other sellers shipping pan-India or internationally."
          >
            <ExpandableRadioCardSection label="Choose how you fulfill" isRequired>
              <CheckboxCardGroup
                aria-label="Choose how you fulfill (ecommerce)"
                value={data.ecomFulfillment}
                onChange={(value) => onChange({ ecomFulfillment: value as string[] })}
              >
                <CheckboxCard
                  value="shipping"
                  title="Shipping"
                  description="Orders shipped via integrated couriers."
                />
                <CheckboxCard
                  value="pickup"
                  title="Pickup"
                  description="Customers collect from your fulfillment center."
                />
              </CheckboxCardGroup>

              {data.ecomFulfillment.includes("shipping") && (
                <div className="flex flex-col gap-xs">
                  <div className="flex items-center gap-xxs text-sm font-medium text-text-secondary">
                    <span>Delivery available areas (from your </span>
                    <span className="cursor-pointer text-text-brand underline">Area Sense</span>
                    <span> module)</span>
                    <span className="text-text-brand" aria-hidden="true">*</span>
                  </div>
                  <SelectField
                    aria-label="Choose from saved locations (ecommerce)"
                    placeholder="Choose from saved locations"
                    size="sm"
                    selectedKey={data.deliveryArea || undefined}
                    onSelectionChange={(key) =>
                      onChange({ deliveryArea: String(key ?? "") })
                    }
                  >
                    {DELIVERY_AREAS.map((area) => (
                      <SelectItem key={area.id} id={area.id}>
                        {area.label}
                      </SelectItem>
                    ))}
                  </SelectField>
                </div>
              )}
            </ExpandableRadioCardSection>
          </ExpandableRadioCard>
        </RadioGroup>
      </div>

      <div className="flex w-full flex-col gap-lg">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-xxs text-sm font-medium text-text-secondary">
            <span>Set order statuses</span>
            <span className="text-text-brand" aria-hidden="true">*</span>
          </div>
          <Button hierarchy="ghost" size="sm" iconLeading={<RefreshCw01 />} onPress={onResetStatuses}>
            Reset to defaults
          </Button>
        </div>

        <div className="w-full overflow-hidden rounded-md border border-border-secondary">
          <Table aria-label="Order statuses">
            <TableHeader>
              <Column isRowHeader allowsSorting>
                Standard status
              </Column>
              <Column helpText="The name customers will see for this status">
                Display name
              </Column>
              <Column>Active</Column>
            </TableHeader>
            <TableBody>
              {data.orderStatuses.map((row) => (
                <Row key={row.id}>
                  <Cell>
                    <span className="inline-flex items-center gap-xs">
                      <StatusDot color={row.color} />
                      <span className="text-sm font-medium text-text-secondary">{row.label}</span>
                      {row.required ? (
                        <span className="text-text-brand" aria-hidden="true">*</span>
                      ) : (
                        <span className="font-normal text-text-tertiary">(optional)</span>
                      )}
                    </span>
                  </Cell>
                  <Cell>
                    <InputField
                      aria-label={`Display name for ${row.label}`}
                      value={row.displayName}
                      onChange={(v) => onUpdateStatus(row.id, { displayName: v })}
                      size="sm"
                    />
                  </Cell>
                  <Cell>
                    <Toggle
                      aria-label={`${row.label} active`}
                      isSelected={row.active}
                      onChange={(active) => onUpdateStatus(row.id, { active })}
                      isDisabled={row.required}
                      size="sm"
                    />
                  </Cell>
                </Row>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};
