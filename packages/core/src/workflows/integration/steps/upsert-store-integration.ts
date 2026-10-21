import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  IntegrationValues,
  MercurModules,
  StoreIntegrationStatus,
} from "@mercurjs/types"

import type IntegrationModuleService from "../../../modules/integration/service"
import type { StoreIntegrationRow } from "../../../modules/integration/service"

/**
 * Persist a store's integration connection. Credentials arrive **already
 * encrypted** (`enc:v1:…`): routes validate + encrypt with
 * `IntegrationModuleService.prepareStoreIntegration` before running the
 * workflow, so plaintext secrets never enter workflow input, output or
 * compensation data (which the workflow engine may checkpoint to Redis).
 */
export type UpsertStoreIntegrationStepInput = {
  seller_id: string
  provider_id: string
  label?: string | null
  is_enabled?: boolean
  encrypted_credentials: string
  settings: IntegrationValues
  /** Resets status to `untested` when the credentials changed. */
  credentials_changed: boolean
  actor_id?: string | null
}

type Snapshot = Pick<
  StoreIntegrationRow,
  | "id"
  | "label"
  | "is_enabled"
  | "credentials"
  | "settings"
  | "status"
  | "last_checked_at"
  | "last_error"
  | "updated_by"
>

type Compensation =
  | { kind: "created"; id: string }
  | { kind: "updated"; previous: Snapshot }

export const upsertStoreIntegrationStepId = "upsert-store-integration"

export const upsertStoreIntegrationStep = createStep(
  upsertStoreIntegrationStepId,
  async (input: UpsertStoreIntegrationStepInput, { container }) => {
    const service = container.resolve<IntegrationModuleService>(
      MercurModules.INTEGRATION
    )

    const existing = await service.retrieveSellerIntegration(
      input.seller_id,
      input.provider_id
    )

    const statusReset = input.credentials_changed
      ? {
          status: StoreIntegrationStatus.UNTESTED,
          last_error: null,
          last_checked_at: null,
        }
      : {}

    if (existing) {
      const previous: Snapshot = {
        id: existing.id,
        label: existing.label,
        is_enabled: existing.is_enabled,
        credentials: existing.credentials,
        settings: existing.settings,
        status: existing.status,
        last_checked_at: existing.last_checked_at,
        last_error: existing.last_error,
        updated_by: existing.updated_by,
      }

      await service.updateStoreIntegrations({
        id: existing.id,
        label: input.label === undefined ? existing.label : input.label,
        is_enabled: input.is_enabled ?? existing.is_enabled,
        credentials: input.encrypted_credentials,
        settings: input.settings,
        updated_by: input.actor_id ?? null,
        ...statusReset,
      })

      return new StepResponse<{ id: string }, Compensation>(
        { id: existing.id },
        { kind: "updated", previous }
      )
    }

    const created = await service.createStoreIntegrations({
      seller_id: input.seller_id,
      provider_id: input.provider_id,
      label: input.label ?? null,
      is_enabled: input.is_enabled ?? true,
      credentials: input.encrypted_credentials,
      settings: input.settings,
      updated_by: input.actor_id ?? null,
      status: StoreIntegrationStatus.UNTESTED,
    })

    return new StepResponse<{ id: string }, Compensation>(
      { id: created.id },
      { kind: "created", id: created.id }
    )
  },
  async (compensation, { container }) => {
    if (!compensation) {
      return
    }
    const service = container.resolve<IntegrationModuleService>(
      MercurModules.INTEGRATION
    )

    if (compensation.kind === "created") {
      await service.deleteStoreIntegrations(compensation.id)
      return
    }

    await service.updateStoreIntegrations(compensation.previous)
  }
)
