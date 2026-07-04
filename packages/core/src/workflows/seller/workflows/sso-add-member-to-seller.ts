import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows"
import { SellerRole } from "@mercurjs/types"

import {
  upsertMembersStep,
  createSellerMembersStep,
  checkSellerHasOwnerStep,
} from "../steps"

export const ssoAddMemberToSellerWorkflowId = "sso-add-member-to-seller"

type SsoAddMemberToSellerWorkflowInput = {
  seller_id: string
  auth_identity_id: string
  email: string
  first_name?: string
  last_name?: string | null
}

export const ssoAddMemberToSellerWorkflow = createWorkflow(
  ssoAddMemberToSellerWorkflowId,
  function (input: SsoAddMemberToSellerWorkflowInput) {
    const members = upsertMembersStep(
      transform(input, ({ email, first_name, last_name }) => [
        { email, first_name: first_name ?? null, last_name: last_name ?? null },
      ])
    )
    const member = transform({ members }, ({ members }) => members[0])

    setAuthAppMetadataStep({
      authIdentityId: input.auth_identity_id,
      actorType: "member",
      value: member.id,
    })

    const ownerCheck = checkSellerHasOwnerStep(
      transform(input, ({ seller_id }) => ({ seller_id }))
    )

    createSellerMembersStep(
      transform(
        { input, member, ownerCheck },
        ({ input, member, ownerCheck }) => [
          {
            seller_id: input.seller_id,
            member_id: member.id,
            role_id: SellerRole.SELLER_ADMINISTRATION,
            is_owner: !ownerCheck.hasOwner,
          },
        ]
      )
    )

    return new WorkflowResponse(member)
  }
)
