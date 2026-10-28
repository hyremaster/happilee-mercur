/**
 * @category Order
 * @customNamespace Order
 */
export const OrderGroupWorkflowEvents = {
    /**
     * Emitted when an order group is created.
     *
     * @eventPayload
     * ```ts
     * {
     *   id, // The ID of the order group
     * }
     * ```
     */
    CREATED: "order_group.created",
}

export const MarketplaceOrderStatusWorkflowEvents = {
  /**
   * Emitted when a seller order's marketplace status changes.
   *
   * @eventPayload
   * ```ts
   * {
   *   order_id, // The ID of the order
   *   seller_id, // The ID of the seller
   *   status, // The new StoreOrderStatusType
   * }
   * ```
   */
  UPDATED: "order.store_status.updated",
}

export const SellerWorkflowEvents = {
  CREATED: "seller.created",
  UPDATED: "seller.updated",
  DELETED: "seller.deleted",
  SUSPENDED: "seller.suspended",
  UNSUSPENDED: "seller.unsuspended",
  APPROVED: "seller.approved",
  TERMINATED: "seller.terminated",
  UNTERMINATED: "seller.unterminated",
}

export const SellerMemberWorkflowEvents = {
  CREATED: "seller_member.created",
  UPDATED: "seller_member.updated",
  DELETED: "seller_member.deleted",
}

export const MemberInviteWorkflowEvents = {
  CREATED: "member_invite.created",
  ACCEPTED: "member_invite.accepted",
}
export const IntegrationWorkflowEvents = {
  /**
   * Emitted when a store saves new credentials for an integration provider and
   * the connection test succeeds.
   *
   * @eventPayload
   * ```ts
   * {
   *   seller_id, // The store (seller) ID
   *   provider_id, // The integration provider ID, e.g. "gofrugal"
   * }
   * ```
   */
  CONNECTED: "integration.connected",
  /**
   * Emitted when a sync stream that runs in the background (catalogue streams)
   * is requested from the API. The run row already exists with status
   * `running`; the subscriber executes it.
   *
   * @eventPayload
   * ```ts
   * {
   *   seller_id, // The store (seller) ID
   *   provider_id, // The integration provider ID
   *   stream, // e.g. "items"
   *   run_id, // The integration_sync_run to execute
   * }
   * ```
   */
  SYNC_REQUESTED: "integration.sync_requested",
}
