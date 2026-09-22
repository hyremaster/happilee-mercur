import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows"

import { upsertMembersStep } from "../steps"

export const ssoCreateMemberWorkflowId = "sso-create-member"

type SsoCreateMemberWorkflowInput = {
  auth_identity_id: string
  email: string
  first_name?: string
  last_name?: string | null
}

export const ssoCreateMemberWorkflow = createWorkflow(
  ssoCreateMemberWorkflowId,
  function (input: SsoCreateMemberWorkflowInput) {
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

    return new WorkflowResponse(member)
  }
)
