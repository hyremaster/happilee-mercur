import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { Link } from "@medusajs/framework/modules-sdk"
import { MercurModules } from "@mercurjs/types"

import VariantAvailabilityModuleService from "../../../modules/variant-availability/service"

export type SetVariantAvailabilityStepInput = {
  variant_id: string
  is_available: boolean
  unavailable_until?: Date | null
}

type VariantAvailabilityRecord = {
  id: string
  is_available: boolean
  unavailable_until: Date | null
}

type SetVariantAvailabilityCompensation =
  | { kind: "created"; variant_id: string; id: string }
  | { kind: "updated"; previous: VariantAvailabilityRecord }

/**
 * Create-or-update the availability record linked to a variant. Marking a
 * variant available clears `unavailable_until` so a stale expiry never lingers.
 */
export const setVariantAvailabilityStep = createStep(
  "set-variant-availability",
  async (input: SetVariantAvailabilityStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const service = container.resolve<VariantAvailabilityModuleService>(
      MercurModules.VARIANT_AVAILABILITY
    )

    const unavailableUntil = input.is_available
      ? null
      : input.unavailable_until ?? null

    const {
      data: [variant],
    } = await query.graph({
      entity: "variant",
      fields: [
        "id",
        "variant_availability.id",
        "variant_availability.is_available",
        "variant_availability.unavailable_until",
      ],
      filters: { id: input.variant_id },
    })

    const existing = (
      variant as
        | { variant_availability?: VariantAvailabilityRecord | null }
        | undefined
    )?.variant_availability

    if (existing) {
      const updated = await service.updateVariantAvailabilities({
        id: existing.id,
        is_available: input.is_available,
        unavailable_until: unavailableUntil,
      })

      return new StepResponse<
        VariantAvailabilityRecord,
        SetVariantAvailabilityCompensation
      >(updated, { kind: "updated", previous: existing })
    }

    const created = await service.createVariantAvailabilities({
      is_available: input.is_available,
      unavailable_until: unavailableUntil,
    })

    const link: Link = container.resolve(ContainerRegistrationKeys.LINK)
    await link.create({
      [Modules.PRODUCT]: { product_variant_id: input.variant_id },
      [MercurModules.VARIANT_AVAILABILITY]: {
        variant_availability_id: created.id,
      },
    })

    return new StepResponse<
      VariantAvailabilityRecord,
      SetVariantAvailabilityCompensation
    >(created, { kind: "created", variant_id: input.variant_id, id: created.id })
  },
  async (compensation, { container }) => {
    if (!compensation) {
      return
    }

    const service = container.resolve<VariantAvailabilityModuleService>(
      MercurModules.VARIANT_AVAILABILITY
    )

    if (compensation.kind === "updated") {
      await service.updateVariantAvailabilities({
        id: compensation.previous.id,
        is_available: compensation.previous.is_available,
        unavailable_until: compensation.previous.unavailable_until,
      })
      return
    }

    const link: Link = container.resolve(ContainerRegistrationKeys.LINK)
    await link.dismiss({
      [Modules.PRODUCT]: { product_variant_id: compensation.variant_id },
      [MercurModules.VARIANT_AVAILABILITY]: {
        variant_availability_id: compensation.id,
      },
    })
    await service.deleteVariantAvailabilities(compensation.id)
  }
)
