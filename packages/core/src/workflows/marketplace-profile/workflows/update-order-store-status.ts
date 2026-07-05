import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"
import { StoreOrderStatusType } from "@mercurjs/types"

import { MarketplaceOrderStatusWorkflowEvents } from "../../events"
import {
  validateOrderStatusTransitionStep,
  createStoreOrderStatusEventStep,
  upsertOrderExtensionStep,
  syncMedusaOrderStateStep,
} from "../steps"

export const updateOrderStoreStatusWorkflowId = "update-order-store-status"

type UpdateOrderStoreStatusWorkflowInput = {
  order_id: string
  seller_id: string
  status: StoreOrderStatusType
  changed_by?: string | null
  note?: string | null
}

export const updateOrderStoreStatusWorkflow: ReturnType<typeof createWorkflow> =
  createWorkflow(
    updateOrderStoreStatusWorkflowId,
    function (input: UpdateOrderStoreStatusWorkflowInput) {
      // 1. Reject invalid transitions (terminal / non-sequential).
      validateOrderStatusTransitionStep(
        transform(input, (i) => ({
          seller_id: i.seller_id,
          order_id: i.order_id,
          status: i.status,
        }))
      )

      // 2. Append the change to history (current status = latest event).
      const event = createStoreOrderStatusEventStep(
        transform(input, (i) => ({
          order_id: i.order_id,
          seller_id: i.seller_id,
          status: i.status,
          changed_by: i.changed_by ?? null,
          note: i.note ?? null,
        }))
      )

      // 3. Keep the denormalized 1:1 current-status read model in sync.
      upsertOrderExtensionStep(
        transform(input, (i) => ({
          order_id: i.order_id,
          seller_id: i.seller_id,
          status: i.status,
        }))
      )

      // 4. Sync delivered/cancelled into Medusa's native order state.
      syncMedusaOrderStateStep(
        transform(input, (i) => ({
          order_id: i.order_id,
          seller_id: i.seller_id,
          status: i.status,
        }))
      )

      emitEventStep({
        eventName: MarketplaceOrderStatusWorkflowEvents.UPDATED,
        data: transform(input, (i) => ({
          order_id: i.order_id,
          seller_id: i.seller_id,
          status: i.status,
        })),
      })

      return new WorkflowResponse(event)
    }
  )
