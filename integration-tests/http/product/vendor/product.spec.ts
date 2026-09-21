import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { IFulfillmentModuleService, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createSellerUser } from "../../../helpers/create-seller-user"

jest.setTimeout(50000)

medusaIntegrationTestRunner({
    testSuite: ({ getContainer, api }) => {
        describe("Vendor - Products", () => {
            let appContainer: MedusaContainer
            let _seller1: any
            let seller1Headers: any
            let _seller2: any
            let seller2Headers: any

            beforeAll(async () => {
                appContainer = getContainer()
            })

            beforeEach(async () => {
                const result1 = await createSellerUser(appContainer, {
                    email: "seller1@test.com",
                    name: "Seller One",
                })
                _seller1 = result1.seller
                seller1Headers = result1.headers

                const result2 = await createSellerUser(appContainer, {
                    email: "seller2@test.com",
                    name: "Seller Two",
                })
                _seller2 = result2.seller
                seller2Headers = result2.headers
            })

            describe("POST /vendor/products", () => {
                it("should create a product with options and variants", async () => {
                    const response = await api.post(
                        `/vendor/products`,
                        {
                            title: "Test Product",
                            description: "A test product",
                            options: [
                                {
                                    title: "Size",
                                    values: ["S", "M", "L"],
                                },
                            ],
                            variants: [
                                {
                                    title: "Small",
                                    options: { Size: "S" },
                                    prices: [
                                        {
                                            currency_code: "usd",
                                            amount: 1000,
                                        },
                                    ],
                                },
                            ],
                        },
                        seller1Headers
                    )

                    expect(response.status).toEqual(201)
                    expect(response.data.product).toEqual(
                        expect.objectContaining({
                            title: "Test Product",
                            description: "A test product",
                        })
                    )
                })

                it("should create a simple product without variants", async () => {
                    const response = await api.post(
                        `/vendor/products`,
                        {
                            title: "Simple Product",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    expect(response.status).toEqual(201)
                    expect(response.data.product.title).toEqual("Simple Product")
                })

                it("should allow a vendor to publish a product on create without admin approval", async () => {
                    const response = await api.post(
                        `/vendor/products`,
                        {
                            title: "Published Product",
                            status: "published",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    expect(response.status).toEqual(201)
                    expect(response.data.product.status).toEqual("published")
                })
            })

            // Checkout rejects a cart whose shippable items have no shipping
            // profile matching the chosen shipping option, and vendors never
            // pick one, so creation has to fill it in.
            describe("POST /vendor/products (shipping profile)", () => {
                const fulfillmentModule = () =>
                    appContainer.resolve<IFulfillmentModuleService>(Modules.FULFILLMENT)

                const productShippingProfileId = async (productId: string) => {
                    const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
                    const { data } = await query.graph({
                        entity: "product",
                        fields: ["shipping_profile.id"],
                        filters: { id: productId },
                    })
                    return (data[0] as { shipping_profile?: { id: string } | null })
                        ?.shipping_profile?.id
                }

                const ensureDefaultProfile = async () => {
                    const [existing] = await fulfillmentModule().listShippingProfiles(
                        { type: "default" },
                        { take: 1 }
                    )
                    if (existing) {
                        return existing.id
                    }
                    const created = await fulfillmentModule().createShippingProfiles({
                        name: "Default Shipping Profile",
                        type: "default",
                    })
                    return created.id
                }

                it("falls back to the default shipping profile when the seller has no shipping options", async () => {
                    const defaultProfileId = await ensureDefaultProfile()

                    const response = await api.post(
                        `/vendor/products`,
                        {
                            title: "Needs Shipping",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    expect(response.status).toEqual(201)
                    expect(await productShippingProfileId(response.data.product.id)).toEqual(
                        defaultProfileId
                    )
                })

                it("uses the profile of the seller's own shipping options", async () => {
                    await ensureDefaultProfile()
                    const sellerProfile = await fulfillmentModule().createShippingProfiles({
                        name: `Seller Profile ${Date.now()}`,
                        type: "all",
                    })

                    // Minimal chain a shipping option needs: set -> zone -> option.
                    const fulfillmentSet = await fulfillmentModule().createFulfillmentSets({
                        name: `set-${Date.now()}`,
                        type: "shipping",
                        service_zones: [
                            {
                                name: `zone-${Date.now()}`,
                                geo_zones: [{ type: "country", country_code: "in" }],
                            },
                        ],
                    })
                    const shippingOption = await fulfillmentModule().createShippingOptions({
                        name: "Seller Standard",
                        service_zone_id: fulfillmentSet.service_zones[0].id,
                        shipping_profile_id: sellerProfile.id,
                        provider_id: "manual_manual",
                        price_type: "flat",
                        type: {
                            label: "Standard",
                            description: "Standard",
                            code: "standard",
                        },
                    })

                    const link = appContainer.resolve(ContainerRegistrationKeys.LINK)
                    await link.create({
                        fulfillment: { shipping_option_id: shippingOption.id },
                        seller: { seller_id: _seller1.id },
                    })

                    const response = await api.post(
                        `/vendor/products`,
                        {
                            title: "Seller Profile Product",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    expect(response.status).toEqual(201)
                    expect(await productShippingProfileId(response.data.product.id)).toEqual(
                        sellerProfile.id
                    )
                })

                it("keeps an explicitly given shipping profile", async () => {
                    await ensureDefaultProfile()
                    const custom = await fulfillmentModule().createShippingProfiles({
                        name: `Custom Profile ${Date.now()}`,
                        type: "custom",
                    })

                    const response = await api.post(
                        `/vendor/products`,
                        {
                            title: "Custom Shipping",
                            shipping_profile_id: custom.id,
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    expect(response.status).toEqual(201)
                    expect(await productShippingProfileId(response.data.product.id)).toEqual(
                        custom.id
                    )
                })
            })

            describe("POST /vendor/products/:id (publish)", () => {
                it("should allow a vendor to publish a draft product without admin approval", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Draft Product",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )
                    expect(createResponse.data.product.status).toEqual("draft")

                    const productId = createResponse.data.product.id

                    const response = await api.post(
                        `/vendor/products/${productId}`,
                        { status: "published" },
                        seller1Headers
                    )

                    expect(response.status).toEqual(200)
                    expect(response.data.product.status).toEqual("published")
                })
            })

            describe("GET /vendor/products", () => {
                it("should list only seller's own products", async () => {
                    await api.post(
                        `/vendor/products`,
                        {
                            title: "Seller 1 Product",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    await api.post(
                        `/vendor/products`,
                        {
                            title: "Seller 2 Product",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller2Headers
                    )

                    const response1 = await api.get(`/vendor/products`, seller1Headers)
                    expect(response1.status).toEqual(200)
                    expect(response1.data.products).toHaveLength(1)
                    expect(response1.data.products[0].title).toEqual("Seller 1 Product")

                    const response2 = await api.get(`/vendor/products`, seller2Headers)
                    expect(response2.status).toEqual(200)
                    expect(response2.data.products).toHaveLength(1)
                    expect(response2.data.products[0].title).toEqual("Seller 2 Product")
                })
            })

            describe("GET /vendor/products/:id", () => {
                it("should get seller's own product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "My Product",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id

                    const response = await api.get(
                        `/vendor/products/${productId}`,
                        seller1Headers
                    )

                    expect(response.status).toEqual(200)
                    expect(response.data.product.id).toEqual(productId)
                })

                it("should not allow seller to get another seller's product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Seller 1 Product",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id

                    const response = await api
                        .get(`/vendor/products/${productId}`, seller2Headers)
                        .catch((e) => e.response)

                    expect(response.status).toEqual(404)
                })
            })

            describe("POST /vendor/products/:id", () => {
                it("should update seller's own product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Original Title",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id

                    const response = await api.post(
                        `/vendor/products/${productId}`,
                        {
                            title: "Updated Title",
                            description: "Updated description",
                        },
                        seller1Headers
                    )

                    expect(response.status).toEqual(200)
                    expect(response.data.product).toEqual(
                        expect.objectContaining({
                            title: "Updated Title",
                            description: "Updated description",
                        })
                    )
                })

                it("should not allow seller to update another seller's product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Seller 1 Product",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id

                    const response = await api
                        .post(
                            `/vendor/products/${productId}`,
                            { title: "Hacked Title" },
                            seller2Headers
                        )
                        .catch((e) => e.response)

                    expect(response.status).toEqual(404)
                })
            })

            describe("DELETE /vendor/products/:id", () => {
                it("should delete seller's own product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Product to Delete",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id

                    const response = await api.delete(
                        `/vendor/products/${productId}`,
                        seller1Headers
                    )

                    expect(response.status).toEqual(200)
                    expect(response.data).toEqual({
                        id: productId,
                        object: "product",
                        deleted: true,
                    })
                })

                it("should not allow seller to delete another seller's product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Seller 1 Product",
                            options: [{ title: "Default", values: ["Default"] }],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id

                    const response = await api
                        .delete(`/vendor/products/${productId}`, seller2Headers)
                        .catch((e) => e.response)

                    expect(response.status).toEqual(404)
                })
            })

            describe("POST /vendor/products/:id/variants", () => {
                it("should create a variant for seller's own product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Product with Options",
                            options: [{ title: "Color", values: ["Red", "Blue"] }],
                            variants: [
                                {
                                    title: "Red Variant",
                                    options: { Color: "Red" },
                                    prices: [{ currency_code: "usd", amount: 1000 }],
                                },
                            ],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id

                    const response = await api.post(
                        `/vendor/products/${productId}/variants`,
                        {
                            title: "Blue Variant",
                            options: { Color: "Blue" },
                            prices: [{ currency_code: "usd", amount: 1200 }],
                        },
                        seller1Headers
                    )

                    expect(response.status).toEqual(201)
                    expect(response.data.product.variants).toHaveLength(2)
                })

                it("should not allow seller to create variant for another seller's product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Seller 1 Product",
                            options: [{ title: "Size", values: ["S", "M"] }],
                            variants: [
                                {
                                    title: "Small",
                                    options: { Size: "S" },
                                    prices: [{ currency_code: "usd", amount: 1000 }],
                                },
                            ],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id

                    const response = await api
                        .post(
                            `/vendor/products/${productId}/variants`,
                            {
                                title: "Medium",
                                options: { Size: "M" },
                                prices: [{ currency_code: "usd", amount: 1100 }],
                            },
                            seller2Headers
                        )
                        .catch((e) => e.response)

                    expect(response.status).toEqual(404)
                })
            })

            describe("POST /vendor/products/:id/variants/:variant_id", () => {
                it("should update a variant for seller's own product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Product",
                            options: [{ title: "Size", values: ["S"] }],
                            variants: [
                                {
                                    title: "Original Variant",
                                    sku: "SKU-001",
                                    options: { Size: "S" },
                                    prices: [{ currency_code: "usd", amount: 1000 }],
                                },
                            ],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id
                    const variantId = createResponse.data.product.variants[0].id

                    const response = await api.post(
                        `/vendor/products/${productId}/variants/${variantId}`,
                        {
                            title: "Updated Variant",
                            sku: "SKU-002",
                        },
                        seller1Headers
                    )

                    expect(response.status).toEqual(200)
                    const updatedVariant = response.data.product.variants.find(
                        (v: any) => v.id === variantId
                    )
                    expect(updatedVariant.title).toEqual("Updated Variant")
                    expect(updatedVariant.sku).toEqual("SKU-002")
                })

                it("should not allow seller to update variant of another seller's product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Seller 1 Product",
                            options: [{ title: "Size", values: ["S"] }],
                            variants: [
                                {
                                    title: "Variant",
                                    options: { Size: "S" },
                                    prices: [{ currency_code: "usd", amount: 1000 }],
                                },
                            ],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id
                    const variantId = createResponse.data.product.variants[0].id

                    const response = await api
                        .post(
                            `/vendor/products/${productId}/variants/${variantId}`,
                            { title: "Hacked Variant" },
                            seller2Headers
                        )
                        .catch((e) => e.response)

                    expect(response.status).toEqual(404)
                })
            })

            describe("DELETE /vendor/products/:id/variants/:variant_id", () => {
                it("should delete a variant from seller's own product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Product",
                            options: [{ title: "Size", values: ["S", "M"] }],
                            variants: [
                                {
                                    title: "Small",
                                    options: { Size: "S" },
                                    prices: [{ currency_code: "usd", amount: 1000 }],
                                },
                                {
                                    title: "Medium",
                                    options: { Size: "M" },
                                    prices: [{ currency_code: "usd", amount: 1100 }],
                                },
                            ],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id
                    const variantId = createResponse.data.product.variants[0].id

                    const response = await api.delete(
                        `/vendor/products/${productId}/variants/${variantId}`,
                        seller1Headers
                    )

                    expect(response.status).toEqual(200)
                    expect(response.data).toEqual({
                        id: variantId,
                        object: "product_variant",
                        deleted: true,
                    })
                })

                it("should not allow seller to delete variant of another seller's product", async () => {
                    const createResponse = await api.post(
                        `/vendor/products`,
                        {
                            title: "Seller 1 Product",
                            options: [{ title: "Size", values: ["S", "M"] }],
                            variants: [
                                {
                                    title: "Small",
                                    options: { Size: "S" },
                                    prices: [{ currency_code: "usd", amount: 1000 }],
                                },
                                {
                                    title: "Medium",
                                    options: { Size: "M" },
                                    prices: [{ currency_code: "usd", amount: 1100 }],
                                },
                            ],
                        },
                        seller1Headers
                    )

                    const productId = createResponse.data.product.id
                    const variantId = createResponse.data.product.variants[0].id

                    const response = await api
                        .delete(
                            `/vendor/products/${productId}/variants/${variantId}`,
                            seller2Headers
                        )
                        .catch((e) => e.response)

                    expect(response.status).toEqual(404)
                })
            })
        })
    },
})
