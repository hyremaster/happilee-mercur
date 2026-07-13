import { RefreshCw01 } from "@happilee-app/icons";
import { Spinner } from "@medusajs/icons";
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
import type { AreaSenseArea } from "../../../services/onboardingServices";
import type { CommerceConfig } from "../types";
import { useAreaSenseAreas } from "../use-area-sense-areas";

type CommerceTypeStepProps = {
  data: CommerceConfig;
  onChange: (patch: Partial<CommerceConfig>) => void;
  onResetStatuses: () => void;
  onUpdateStatus: (id: string, patch: { displayName?: string; active?: boolean }) => void;
  isLoadingStatuses: boolean;
  isStatusesError: boolean;
  onRetryStatuses: () => void;
  isResetDisabled: boolean;
};

type DeliveryAreaSelectProps = {
  ariaLabel: string;
  deliveryArea: string;
  deliveryAreaName: string;
  areas: AreaSenseArea[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onChange: (patch: Partial<CommerceConfig>) => void;
};

function DeliveryAreaSelect({
  ariaLabel,
  deliveryArea,
  deliveryAreaName,
  areas,
  isLoading,
  isError,
  onRetry,
  onChange,
}: DeliveryAreaSelectProps) {
  if (isError) {
    return (
      <div className="flex flex-col gap-sm rounded-md border border-border-secondary bg-bg-secondary px-lg py-md">
        <p className="text-sm text-text-secondary">
          We couldn&apos;t load delivery areas right now.
        </p>
        <Button
          hierarchy="secondary"
          size="sm"
          iconLeading={<RefreshCw01 />}
          onPress={onRetry}
        >
          Try again
        </Button>
      </div>
    );
  }

  const selectedAreaMissingFromList =
    !!deliveryArea &&
    !!deliveryAreaName &&
    !areas.some((entry) => entry.area_sense_id === deliveryArea);

  return (
    <SelectField
      aria-label={ariaLabel}
      placeholder={isLoading ? "Loading areas..." : "Choose from saved locations"}
      size="sm"
      selectedKey={deliveryArea || undefined}
      isDisabled={isLoading}
      onSelectionChange={(key) => {
        if (key == null) {
          return;
        }

        const areaId = String(key);
        const area = areas.find((entry) => entry.area_sense_id === areaId);

        onChange({
          deliveryArea: areaId,
          deliveryAreaName: area?.area_name ?? deliveryAreaName,
        });
      }}
    >
      {selectedAreaMissingFromList && (
        <SelectItem id={deliveryArea} textValue={deliveryAreaName}>
          {deliveryAreaName}
        </SelectItem>
      )}
      {areas.map((area) => (
        <SelectItem
          key={area.area_sense_id}
          id={area.area_sense_id}
          textValue={area.area_name}
        >
          {area.area_name}
        </SelectItem>
      ))}
    </SelectField>
  );
}

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

  if (data.orderStatuses.length === 0) return false;

  return true;
}

type OrderStatusesTableProps = {
  orderStatuses: CommerceConfig["orderStatuses"];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onResetStatuses: () => void;
  onUpdateStatus: (id: string, patch: { displayName?: string; active?: boolean }) => void;
  isResetDisabled: boolean;
};

function OrderStatusesTable({
  orderStatuses,
  isLoading,
  isError,
  onRetry,
  onResetStatuses,
  onUpdateStatus,
  isResetDisabled,
}: OrderStatusesTableProps) {
  return (
    <div className="flex w-full flex-col gap-lg">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-xxs text-sm font-medium text-text-secondary">
          <span>Set order statuses</span>
          <span className="text-text-brand" aria-hidden="true">*</span>
        </div>
        <Button
          hierarchy="ghost"
          size="sm"
          iconLeading={<RefreshCw01 />}
          onPress={onResetStatuses}
          isDisabled={isResetDisabled}
        >
          Reset to defaults
        </Button>
      </div>

      {isError ? (
        <div className="flex flex-col gap-sm rounded-md border border-border-secondary bg-bg-secondary px-lg py-md">
          <p className="text-sm text-text-secondary">
            We couldn&apos;t load order statuses right now.
          </p>
          <Button
            hierarchy="secondary"
            size="sm"
            iconLeading={<RefreshCw01 />}
            onPress={onRetry}
          >
            Try again
          </Button>
        </div>
      ) : (
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
              {isLoading ? (
                <Row>
                  <Cell colSpan={3}>
                    <div className="flex items-center justify-center gap-sm py-lg">
                      <Spinner className="animate-spin text-text-tertiary" />
                      <span className="text-sm text-text-secondary">Loading statuses...</span>
                    </div>
                  </Cell>
                </Row>
              ) : (
                orderStatuses.map((row) => (
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
                        isDisabled={row.required}
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
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export const CommerceTypeStep = ({
  data,
  onChange,
  onResetStatuses,
  onUpdateStatus,
  isLoadingStatuses,
  isStatusesError,
  onRetryStatuses,
  isResetDisabled,
}: CommerceTypeStepProps) => {
  const {
    areas,
    isLoading: isLoadingAreas,
    isError: isAreasError,
    refetch: refetchAreas,
  } = useAreaSenseAreas();

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
                  <DeliveryAreaSelect
                    ariaLabel="Choose from saved locations"
                    deliveryArea={data.deliveryArea}
                    deliveryAreaName={data.deliveryAreaName}
                    areas={areas}
                    isLoading={isLoadingAreas}
                    isError={isAreasError}
                    onRetry={() => {
                      void refetchAreas();
                    }}
                    onChange={onChange}
                  />
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
                  <DeliveryAreaSelect
                    ariaLabel="Choose from saved locations (ecommerce)"
                    deliveryArea={data.deliveryArea}
                    deliveryAreaName={data.deliveryAreaName}
                    areas={areas}
                    isLoading={isLoadingAreas}
                    isError={isAreasError}
                    onRetry={() => {
                      void refetchAreas();
                    }}
                    onChange={onChange}
                  />
                </div>
              )}
            </ExpandableRadioCardSection>
          </ExpandableRadioCard>
        </RadioGroup>
      </div>

      <OrderStatusesTable
        orderStatuses={data.orderStatuses}
        isLoading={isLoadingStatuses}
        isError={isStatusesError}
        onRetry={onRetryStatuses}
        onResetStatuses={onResetStatuses}
        onUpdateStatus={onUpdateStatus}
        isResetDisabled={isResetDisabled}
      />
    </div>
  );
};
