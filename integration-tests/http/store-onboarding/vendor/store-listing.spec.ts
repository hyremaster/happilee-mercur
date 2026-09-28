import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { MercurModules } from "@mercurjs/types"
import { createSellerUser } from "../../../helpers/create-seller-user"

jest.setTimeout(60000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Vendor - Store onboarding listing", () => {
      let appContainer: MedusaContainer

      let ownerSeller: any
      let ownerHeaders: any

      let teamMemberSeller: any
      let teamMember: any
      let teamMemberHeaders: any

      beforeAll(async () => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        // Store A — owned by its own member.
        const a = await createSellerUser(appContainer, {
          email: "owner@test.com",
          name: "Owner Store",
        })
        ownerSeller = a.seller
        ownerHeaders = a.headers

        // Store B — owned by a different member, who we then add to Store A as
        // a NON-owner team member.
        const b = await createSellerUser(appContainer, {
          email: "teammember@test.com",
          name: "Team Store",
        })
        teamMemberSeller = b.seller
        teamMember = b.member
        teamMemberHeaders = b.headers

        const sellerService = appContainer.resolve(MercurModules.SELLER)
        await sellerService.createSellerMembers([
          {
            seller_id: ownerSeller.id,
            member_id: teamMember.id,
            is_owner: false,
          },
        ])
      })

      it("lists stores where the member is a non-owner team member, not only owned stores", async () => {
        const response = await api.get(
          "/vendor/store-onboarding?offset=0&limit=10",
          teamMemberHeaders
        )

        expect(response.status).toEqual(200)

        const storeIds = response.data.stores.map((s: { id: string }) => s.id)

        // Own store (is_owner) — was always visible.
        expect(storeIds).toContain(teamMemberSeller.id)
        // Team-member store (non-owner) — the regression: previously hidden here
        // while /vendor/sellers still showed it.
        expect(storeIds).toContain(ownerSeller.id)
      })

      it("returns each store's own email, not the newest store's email", async () => {
        // One member, two stores created through the wizard with different
        // contact emails. The wizard derives an owner @handle from the email and
        // that handle is member-wide, so the listing must not use it as the
        // store's identity — every row would show the newest email.
        const first = await api.post(
          "/vendor/store-onboarding",
          {
            name: "First Store",
            email: "first-store@test.com",
            currency_code: "usd",
            owner_handle: "firststore",
          },
          ownerHeaders
        )
        const second = await api.post(
          "/vendor/store-onboarding",
          {
            name: "Second Store",
            email: "second-store@test.com",
            currency_code: "usd",
            owner_handle: "secondstore",
          },
          ownerHeaders
        )
        expect([first.status, second.status]).toEqual([201, 201])

        const response = await api.get(
          "/vendor/store-onboarding?offset=0&limit=100",
          ownerHeaders
        )
        expect(response.status).toEqual(200)

        const emailByName = new Map(
          response.data.stores.map((s: { name: string; email: string | null }) => [
            s.name,
            s.email,
          ])
        )
        expect(emailByName.get("First Store")).toEqual("first-store@test.com")
        expect(emailByName.get("Second Store")).toEqual("second-store@test.com")

        // The member-wide handle is now "secondstore" for every row, which is
        // exactly why rows must not be identified by it.
        const handles = new Set(
          response.data.stores
            .filter((s: { name: string }) =>
              ["First Store", "Second Store"].includes(s.name)
            )
            .map((s: { owner_handle: string | null }) => s.owner_handle)
        )
        expect(handles.size).toEqual(1)
      })

      it("matches the set of stores returned by /vendor/sellers", async () => {
        const [onboarding, sellers] = await Promise.all([
          api.get("/vendor/store-onboarding?offset=0&limit=100", teamMemberHeaders),
          api.get("/vendor/sellers?offset=0&limit=100", teamMemberHeaders),
        ])

        const onboardingStoreIds = new Set(
          onboarding.data.stores
            .filter((s: { object: string }) => s.object === "store")
            .map((s: { id: string }) => s.id)
        )
        const sellerStoreIds = new Set(
          sellers.data.seller_members.map(
            (sm: { seller_id: string }) => sm.seller_id
          )
        )

        expect(onboardingStoreIds).toEqual(sellerStoreIds)
      })
    })
  },
})
