import { Container, DatePicker, Heading, Label, Switch, Text, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useSetVariantAvailability } from "@hooks/api/products"
import { ExtendedAdminProductVariant } from "@custom-types/products"

type VariantAvailability = {
  is_available?: boolean | null
  unavailable_until?: string | null
}

type VariantAvailabilitySectionProps = {
  variant: ExtendedAdminProductVariant & {
    variant_availability?: VariantAvailability | null
  }
}

/** Mirrors the backend rule: an expired `unavailable_until` means available. */
export const isVariantAvailable = (
  availability: VariantAvailability | null | undefined,
  now: Date = new Date()
) => {
  if (!availability || availability.is_available !== false) {
    return true
  }
  if (!availability.unavailable_until) {
    return false
  }
  return new Date(availability.unavailable_until).getTime() <= now.getTime()
}

export const VariantAvailabilitySection = ({
  variant,
}: VariantAvailabilitySectionProps) => {
  const { t } = useTranslation()
  const availability = variant.variant_availability
  const available = isVariantAvailable(availability)
  const until =
    !available && availability?.unavailable_until
      ? new Date(availability.unavailable_until)
      : null

  const { mutateAsync, isPending } = useSetVariantAvailability(
    variant.product_id!,
    variant.id
  )

  const save = async (payload: {
    is_available: boolean
    unavailable_until?: Date | null
  }) => {
    await mutateAsync(payload, {
      onSuccess: () => {
        toast.success(t("products.variant.availability.successToast"))
      },
      onError: (error) => {
        toast.error(error.message)
      },
    })
  }

  return (
    <Container className="flex flex-col divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("products.variant.availability.header")}</Heading>
      </div>
      <div className="flex flex-col gap-y-4 px-6 py-4">
        <div className="flex items-start gap-x-3">
          <Switch
            id="variant-available"
            checked={available}
            disabled={isPending}
            onCheckedChange={(checked) => save({ is_available: checked })}
          />
          <div className="flex flex-col gap-y-1">
            <Label htmlFor="variant-available" size="small" weight="plus">
              {t("products.variant.availability.availableLabel")}
            </Label>
            <Text size="small" className="text-ui-fg-subtle">
              {t("products.variant.availability.availableHint")}
            </Text>
          </div>
        </div>
        {!available && (
          <div className="flex flex-col gap-y-2">
            <Label size="small" weight="plus">
              {t("products.variant.availability.availableUntilLabel")}
            </Label>
            <DatePicker
              granularity="minute"
              minValue={new Date()}
              value={until}
              isDisabled={isPending}
              onChange={(date) =>
                save({
                  is_available: false,
                  unavailable_until: date ?? null,
                })
              }
            />
            <Text size="small" className="text-ui-fg-subtle">
              {t("products.variant.availability.availableUntilHint")}
            </Text>
          </div>
        )}
      </div>
    </Container>
  )
}
