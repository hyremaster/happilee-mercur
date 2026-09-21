import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
    IRegionModuleService,
    ISalesChannelModuleService,
    MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createSellerUser } from "../../../helpers/create-seller-user"
import { createCustomerUser } from "../../../helpers/create-customer-user"
import { generatePublishableKey, generateStoreHeaders } from "../../../helpers/create-admin-user"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
    testSuite: ({ getContainer, api }) => {
        describe("Vendor - Orders", () => {
            let appContainer: MedusaContainer
            let seller1: any
            let seller1Headers: any
            let seller2: any
            let seller2Headers: any
            let _customer: any
            let storeHeaders: any
            let region: any
            let salesChannel: any
            let product1: any
            let product2: any
            let _shippingOption1: any
            let _shippingOption2: any

            beforeAll(async () => {
                appContainer = getContainer()
            })

            beforeEach(async () => {
                // Create first seller
                const seller1Result = await createSellerUser(appContainer, {
                    email: "seller1@test.com",
                    name: "Test Seller 1",
                })
                seller1 = seller1Result.seller
                seller1Headers = seller1Result.headers

                // Create second seller
                const seller2Result = await createSellerUser(appContainer, {
                    email: "seller2@test.com",
                    name: "Test Seller 2",
                })
                seller2 = seller2Result.seller
                seller2Headers = seller2Result.headers

                // Create customer
                const customerResult = await createCustomerUser(appContainer, {
                    email: "ordercustomer@test.com",
                    first_name: "Order",
                    last_name: "Customer",
                })
                _customer = customerResult.customer

                const apiKey = await generatePublishableKey(appContainer)
                storeHeaders = generateStoreHeaders({ publishableKey: apiKey })
                storeHeaders = { headers: { ...storeHeaders.headers, ...customerResult.headers.headers } }

                // Create sales channel
                const salesChannelModule = appContainer.resolve<ISalesChannelModuleService>(Modules.SALES_CHANNEL)
                salesChannel = await salesChannelModule.createSalesChannels({
                    name: "Test Store",
                })

                // Create region
                const regionModule = appContainer.resolve<IRegionModuleService>(Modules.REGION)
                region = await regionModule.createRegions({
                    name: "Test Region",
                    currency_code: "usd",
                    countries: ["us"],
                })

                // Link payment provider to region
                const link = appContainer.resolve(ContainerRegistrationKeys.LINK)
                await link.create({
                    [Modules.REGION]: { region_id: region.id },
                    [Modules.PAYMENT]: { payment_provider_id: "pp_system_default" },
                })

                // Create product for seller 1
                const product1Response = await api.post(
                    `/vendor/products`,
                    {
                        status: 'published',
                        title: "Seller 1 Product",
                        description: "Product from seller 1",
                        options: [{ title: "Size", values: ["S", "M"] }],
                        variants: [
                            {
                                title: "Small",
                                sku: "SELLER1-S",
                                options: { Size: "S" },
                                prices: [{ currency_code: "usd", amount: 2000 }],
                                manage_inventory: false,
                            },
                        ],
                        sales_channels: [{ id: salesChannel.id }],
                    },
                    seller1Headers
                )
                product1 = product1Response.data.product

                // Create product for seller 2
                const product2Response = await api.post(
                    `/vendor/products`,
                    {
                        status: 'published',
                        title: "Seller 2 Product",
                        description: "Product from seller 2",
                        options: [{ title: "Color", values: ["Red", "Blue"] }],
                        variants: [
                            {
                                title: "Red",
                                sku: "SELLER2-RED",
                                options: { Color: "Red" },
                                prices: [{ currency_code: "usd", amount: 3000 }],
                                manage_inventory: false,
                            },
                        ],
                        sales_channels: [{ id: salesChannel.id }],
                    },
                    seller2Headers
                )
                product2 = product2Response.data.product

                // Create shipping prerequisites for seller 1
                const shippingPrerequisites1 = await createShippingPrerequisites(seller1Headers, "seller1")

                // Create shipping option for seller 1
                const shippingOption1Response = await api.post(
                    `/vendor/shipping-options`,
                    {
                        name: "Seller 1 Shipping",
                        service_zone_id: shippingPrerequisites1.serviceZone.id,
                        shipping_profile_id: shippingPrerequisites1.shippingProfile.id,
                        provider_id: "manual_manual",
                        price_type: "flat",
                        type: {
                            label: "Standard",
                            description: "Standard shipping",
                            code: "standard",
                        },
                        prices: [{ currency_code: "usd", amount: 500 }],
                        rules: [
                            {
                                attribute: "enabled_in_store",
                                value: "true",
                                operator: "eq",
                            },
                        ],
                    },
                    seller1Headers
                )
                _shippingOption1 = shippingOption1Response.data.shipping_option

                // Create shipping prerequisites for seller 2
                const shippingPrerequisites2 = await createShippingPrerequisites(seller2Headers, "seller2")

                // Create shipping option for seller 2
                const shippingOption2Response = await api.post(
                    `/vendor/shipping-options`,
                    {
                        name: "Seller 2 Shipping",
                        service_zone_id: shippingPrerequisites2.serviceZone.id,
                        shipping_profile_id: shippingPrerequisites2.shippingProfile.id,
                        provider_id: "manual_manual",
                        price_type: "flat",
                        type: {
                            label: "Standard",
                            description: "Standard shipping",
                            code: "standard",
                        },
                        prices: [{ currency_code: "usd", amount: 600 }],
                        rules: [
                            {
                                attribute: "enabled_in_store",
                                value: "true",
                                operator: "eq",
                            },
                        ],
                    },
                    seller2Headers
                )
                _shippingOption2 = shippingOption2Response.data.shipping_option
            })

            let prerequisiteCounter = 0

            const createShippingPrerequisites = async (headers: any, prefix: string) => {
                const uniqueSuffix = `_${prefix}_${Date.now()}_${++prerequisiteCounter}`

                // Create stock location
                const locationResponse = await api.post(
                    `/vendor/stock-locations`,
                    { name: `Warehouse${uniqueSuffix}` },
                    headers
                )
                const stockLocation = locationResponse.data.stock_location

                // Create fulfillment set
                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/fulfillment-sets`,
                    {
                        name: `Fulfillment Set${uniqueSuffix}`,
                        type: "shipping",
                    },
                    headers
                )

                const updatedLocation = await api.get(
                    `/vendor/stock-locations/${stockLocation.id}?fields=*fulfillment_sets`,
                    headers
                )
                const fulfillmentSet = updatedLocation.data.stock_location.fulfillment_sets[0]

                // Create service zone
                const serviceZoneResponse = await api.post(
                    `/vendor/fulfillment-sets/${fulfillmentSet.id}/service-zones`,
                    {
                        name: `Service Zone${uniqueSuffix}`,
                        geo_zones: [{ type: "country", country_code: "us" }],
                    },
                    headers
                )
                const serviceZone = serviceZoneResponse.data.fulfillment_set.service_zones.find(
                    (z: any) => z.name === `Service Zone${uniqueSuffix}`
                )

                // Create shipping profile
                const shippingProfileResponse = await api.post(
                    `/vendor/shipping-profiles`,
                    {
                        name: `Shipping Profile${uniqueSuffix}`,
                        type: "default",
                    },
                    headers
                )
                const shippingProfile = shippingProfileResponse.data.shipping_profile

                // Add fulfillment provider
                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/fulfillment-providers`,
                    { add: ["manual_manual"] },
                    headers
                )

                // Link stock location to sales channel
                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/sales-channels`,
                    { add: [salesChannel.id] },
                    headers
                )

                return {
                    stockLocation,
                    fulfillmentSet,
                    serviceZone,
                    shippingProfile,
                }
            }



            describe("Order Split by Vendor", () => {

                it("should create single order when cart has items from one seller only", async () => {
                    // 1. Create cart with customer authentication
                    const cartResponse = await api.post(
                        `/store/carts`,
                        {
                            region_id: region.id,
                            sales_channel_id: salesChannel.id,
                            currency_code: "usd",
                        },
                        storeHeaders
                    )
                    let cart = cartResponse.data.cart

                    // 2. Add items from seller 1 only
                    const addItemResponse = await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product1.variants[0].id,
                            quantity: 3,
                        },
                        storeHeaders
                    )
                    cart = addItemResponse.data.cart
                    expect(cart.items).toHaveLength(1)

                    // 3. Get available shipping options
                    const shippingOptionsResponse = await api.get(
                        `/store/shipping-options?cart_id=${cart.id}`,
                        storeHeaders
                    )

                    const sellerShippingOptions = shippingOptionsResponse.data.shipping_options as Record<string, any[]>

                    // 4. Add shipping method
                    for (const [, options] of Object.entries(sellerShippingOptions)) {
                        if (options.length > 0) {
                            await api.post(
                                `/store/carts/${cart.id}/shipping-methods`,
                                {
                                    option_id: options[0].id,
                                },
                                storeHeaders
                            )
                        }
                    }

                    // 5. Create payment collection
                    const paymentCollectionResponse = await api.post(
                        `/store/payment-collections`,
                        { cart_id: cart.id },
                        storeHeaders
                    )
                    const paymentCollection = paymentCollectionResponse.data.payment_collection

                    // 6. Initialize payment session
                    await api.post(
                        `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
                        {
                            provider_id: "pp_system_default",
                        },
                        storeHeaders
                    )

                    // 7. Complete the cart
                    const completeResponse = await api.post(
                        `/store/carts/${cart.id}/complete`,
                        {},
                        storeHeaders
                    )

                    expect(completeResponse.status).toEqual(200)
                    expect(completeResponse.data.type).toEqual("order_group")
                    expect(completeResponse.data.order_group).toBeDefined()

                    const orderGroupId = completeResponse.data.order_group.id

                    // 8. Fetch order group with orders using the order-groups endpoint
                    const orderGroupResponse = await api.get(
                        `/store/order-groups/${orderGroupId}?fields=seller_count,*orders,orders.seller.id,*orders.items`,
                        storeHeaders
                    )

                    expect(orderGroupResponse.status).toEqual(200)
                    const orderGroup = orderGroupResponse.data.order_group

                    // Verify only one order was created
                    expect(orderGroup.orders).toBeDefined()
                    expect(orderGroup.orders.length).toEqual(1)
                    expect(orderGroup.seller_count).toEqual(1)

                    // Verify order details are included
                    const order = orderGroup.orders[0]
                    expect(order.id).toBeDefined()
                    expect(order.seller.id).toEqual(seller1.id)
                    expect(order.items).toBeDefined()
                })

                // A cart holds one store's items (docs/store-scoped-customers.md),
                // so each seller's order comes from its own cart.
                const placeOrderFor = async (product: any): Promise<string> => {
                    const cartResponse = await api.post(
                        `/store/carts`,
                        {
                            region_id: region.id,
                            sales_channel_id: salesChannel.id,
                            currency_code: "usd",
                        },
                        storeHeaders
                    )
                    const cart = cartResponse.data.cart

                    await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        { variant_id: product.variants[0].id, quantity: 1 },
                        storeHeaders
                    )

                    const shippingOptionsResponse = await api.get(
                        `/store/shipping-options?cart_id=${cart.id}`,
                        storeHeaders
                    )
                    const sellerShippingOptions = shippingOptionsResponse.data
                        .shipping_options as Record<string, any[]>

                    for (const [, options] of Object.entries(sellerShippingOptions)) {
                        if (options.length > 0) {
                            await api.post(
                                `/store/carts/${cart.id}/shipping-methods`,
                                { option_id: options[0].id },
                                storeHeaders
                            )
                        }
                    }

                    const paymentCollectionResponse = await api.post(
                        `/store/payment-collections`,
                        { cart_id: cart.id },
                        storeHeaders
                    )
                    await api.post(
                        `/store/payment-collections/${paymentCollectionResponse.data.payment_collection.id}/payment-sessions`,
                        { provider_id: "pp_system_default" },
                        storeHeaders
                    )

                    const completeResponse = await api.post(
                        `/store/carts/${cart.id}/complete`,
                        {},
                        storeHeaders
                    )
                    expect(completeResponse.status).toEqual(200)

                    const orderGroupResponse = await api.get(
                        `/store/order-groups/${completeResponse.data.order_group.id}?fields=*orders,orders.seller.id`,
                        storeHeaders
                    )
                    const orders = orderGroupResponse.data.order_group.orders
                    expect(orders).toHaveLength(1)
                    return orders[0].id
                }

                it("should allow vendor to view their own orders", async () => {
                    const order1Id = await placeOrderFor(product1)
                    const order2Id = await placeOrderFor(product2)

                    const seller1Orders = (
                        await api.get(`/vendor/orders`, seller1Headers)
                    ).data.orders.map((o: any) => o.id)
                    const seller2Orders = (
                        await api.get(`/vendor/orders`, seller2Headers)
                    ).data.orders.map((o: any) => o.id)

                    // Each vendor sees its own order and not the other's.
                    expect(seller1Orders).toContain(order1Id)
                    expect(seller1Orders).not.toContain(order2Id)
                    expect(seller2Orders).toContain(order2Id)
                    expect(seller2Orders).not.toContain(order1Id)
                })
            })
        })
    },
})
