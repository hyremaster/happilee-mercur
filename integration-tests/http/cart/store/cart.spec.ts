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
        describe("Store - Cart", () => {
            let appContainer: MedusaContainer
            let seller: any
            let sellerHeaders: any
            let _customer: any
            let customerHeaders: any
            let storeHeaders: any
            let region: any
            let salesChannel: any
            let product: any
            let shippingOption: any

            beforeAll(async () => {
                appContainer = getContainer()
            })

            beforeEach(async () => {
                // Create seller
                const sellerResult = await createSellerUser(appContainer, {
                    email: "seller@test.com",
                    name: "Test Seller",
                })
                seller = sellerResult.seller
                sellerHeaders = sellerResult.headers

                // Create customer
                const customerResult = await createCustomerUser(appContainer, {
                    email: "customer@test.com",
                    first_name: "Test",
                    last_name: "Customer",
                })
                _customer = customerResult.customer
                customerHeaders = customerResult.headers

                const apiKey = await generatePublishableKey(appContainer)
                storeHeaders = generateStoreHeaders({ publishableKey: apiKey })

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

                // Create product with variant
                const productResponse = await api.post(
                    `/vendor/products`,
                    {
                        status: 'published',
                        title: "Test Product",
                        description: "A test product for cart",
                        options: [{ title: "Size", values: ["S", "M", "L"] }],
                        variants: [
                            {
                                title: "Small",
                                sku: "TEST-S",
                                options: { Size: "S" },
                                prices: [{ currency_code: "usd", amount: 2000 }],
                                manage_inventory: false,
                            },
                            {
                                title: "Medium",
                                sku: "TEST-M",
                                options: { Size: "M" },
                                prices: [{ currency_code: "usd", amount: 2500 }],
                                manage_inventory: false,
                            },
                        ],
                        sales_channels: [{ id: salesChannel.id }],
                    },
                    sellerHeaders
                )
                product = productResponse.data.product

                // Create shipping prerequisites
                const shippingPrerequisites = await createShippingPrerequisites(sellerHeaders)

                // Create shipping option
                const shippingOptionResponse = await api.post(
                    `/vendor/shipping-options`,
                    {
                        name: "Standard Shipping",
                        service_zone_id: shippingPrerequisites.serviceZone.id,
                        shipping_profile_id: shippingPrerequisites.shippingProfile.id,
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
                    sellerHeaders
                )
                shippingOption = shippingOptionResponse.data.shipping_option
            })

            let prerequisiteCounter = 0

            const createShippingPrerequisites = async (headers: any) => {
                const uniqueSuffix = `_${Date.now()}_${++prerequisiteCounter}`

                // Create stock location
                const locationResponse = await api.post(
                    `/vendor/stock-locations`,
                    { name: `Test Warehouse${uniqueSuffix}` },
                    headers
                )
                const stockLocation = locationResponse.data.stock_location

                // Create fulfillment set
                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/fulfillment-sets`,
                    {
                        name: `Test Fulfillment Set${uniqueSuffix}`,
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
                        name: `Test Service Zone${uniqueSuffix}`,
                        geo_zones: [{ type: "country", country_code: "us" }],
                    },
                    headers
                )
                const serviceZone = serviceZoneResponse.data.fulfillment_set.service_zones.find(
                    (z: any) => z.name === `Test Service Zone${uniqueSuffix}`
                )

                // Create shipping profile
                const shippingProfileResponse = await api.post(
                    `/vendor/shipping-profiles`,
                    {
                        name: `Test Shipping Profile${uniqueSuffix}`,
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

            describe("Cart Flow", () => {
                it("should create a cart", async () => {
                    const response = await api.post(
                        `/store/carts`,
                        {
                            region_id: region.id,
                            sales_channel_id: salesChannel.id,
                            currency_code: "usd",
                        },
                        storeHeaders
                    )

                    expect(response.status).toEqual(200)
                    expect(response.data.cart).toBeDefined()
                    expect(response.data.cart.id).toBeDefined()
                    expect(response.data.cart.region_id).toEqual(region.id)
                })

                it("should add items to cart", async () => {
                    // Create cart
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

                    // Add item to cart
                    const addItemResponse = await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 2,
                        },
                        storeHeaders
                    )

                    expect(addItemResponse.status).toEqual(200)
                    expect(addItemResponse.data.cart.items).toHaveLength(1)
                    expect(addItemResponse.data.cart.items[0].quantity).toEqual(2)
                    expect(addItemResponse.data.cart.items[0].variant_id).toEqual(product.variants[0].id)
                })

                it("should update cart with shipping address", async () => {
                    // Create cart with item
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
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )

                    // Update cart with shipping address
                    const updateResponse = await api.post(
                        `/store/carts/${cart.id}`,
                        {
                            email: "customer@test.com",
                            shipping_address: {
                                metadata: { latitude: 12.9716, longitude: 77.5946 },
                                first_name: "John",
                                last_name: "Doe",
                                address_1: "123 Main St",
                                city: "New York",
                                country_code: "us",
                                postal_code: "10001",
                            },
                            billing_address: {
                                first_name: "John",
                                last_name: "Doe",
                                address_1: "123 Main St",
                                city: "New York",
                                country_code: "us",
                                postal_code: "10001",
                            },
                        },
                        storeHeaders
                    )

                    expect(updateResponse.status).toEqual(200)
                    expect(updateResponse.data.cart.shipping_address).toBeDefined()
                    expect(updateResponse.data.cart.shipping_address.city).toEqual("New York")
                })

                it("should add shipping method to cart", async () => {
                    // Create cart with item
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
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )

                    // Update cart with shipping address
                    await api.post(
                        `/store/carts/${cart.id}`,
                        {
                            email: "customer@test.com",
                            shipping_address: {
                                metadata: { latitude: 12.9716, longitude: 77.5946 },
                                first_name: "John",
                                last_name: "Doe",
                                address_1: "123 Main St",
                                city: "New York",
                                country_code: "us",
                                postal_code: "10001",
                            },
                        },
                        storeHeaders
                    )

                    // Get shipping options for cart (grouped by seller)
                    const shippingOptionsResponse = await api.get(
                        `/store/shipping-options?cart_id=${cart.id}`,
                        storeHeaders
                    )

                    expect(shippingOptionsResponse.status).toEqual(200)

                    // Flatten shipping options from seller map
                    const allShippingOptions = Object.values(
                        shippingOptionsResponse.data.shipping_options as Record<string, any[]>
                    ).flat()

                    if (allShippingOptions.length > 0) {
                        // Add shipping method
                        const addShippingResponse = await api.post(
                            `/store/carts/${cart.id}/shipping-methods`,
                            {
                                option_id: allShippingOptions[0].id,
                            },
                            storeHeaders
                        )

                        expect(addShippingResponse.status).toEqual(200)
                        expect(addShippingResponse.data.cart.shipping_methods).toBeDefined()
                    }
                })

                it("should complete full cart checkout flow and return order_group", async () => {
                    // 1. Create cart
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
                    expect(cart.id).toBeDefined()

                    // 2. Add items to cart
                    const addItemResponse = await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 2,
                        },
                        storeHeaders
                    )
                    cart = addItemResponse.data.cart
                    expect(cart.items).toHaveLength(1)

                    // 3. Update cart with customer info and addresses
                    const updateResponse = await api.post(
                        `/store/carts/${cart.id}`,
                        {
                            email: "checkout@test.com",
                            shipping_address: {
                                metadata: { latitude: 12.9716, longitude: 77.5946 },
                                first_name: "Jane",
                                last_name: "Doe",
                                address_1: "456 Oak Ave",
                                city: "Los Angeles",
                                country_code: "us",
                                postal_code: "90001",
                                phone: "555-1234",
                            },
                            billing_address: {
                                first_name: "Jane",
                                last_name: "Doe",
                                address_1: "456 Oak Ave",
                                city: "Los Angeles",
                                country_code: "us",
                                postal_code: "90001",
                            },
                        },
                        storeHeaders
                    )
                    cart = updateResponse.data.cart
                    expect(cart.email).toEqual("checkout@test.com")
                    expect(cart.shipping_address).toBeDefined()

                    // 4. Get available shipping options (grouped by seller)
                    const shippingOptionsResponse = await api.get(
                        `/store/shipping-options?cart_id=${cart.id}`,
                        storeHeaders
                    )

                    // Flatten shipping options from seller map
                    const allShippingOptions = Object.values(
                        shippingOptionsResponse.data.shipping_options as Record<string, any[]>
                    ).flat()

                    // 5. Add shipping method if available
                    if (allShippingOptions.length > 0) {
                        const addShippingResponse = await api.post(
                            `/store/carts/${cart.id}/shipping-methods`,
                            {
                                option_id: allShippingOptions[0].id,
                            },
                            storeHeaders
                        )
                        cart = addShippingResponse.data.cart
                        expect(cart.shipping_methods?.length).toBeGreaterThan(0)
                    }

                    // 6. Create payment collection for the cart
                    const paymentCollectionResponse = await api.post(
                        `/store/payment-collections`,
                        { cart_id: cart.id },
                        storeHeaders
                    )

                    const paymentCollection = paymentCollectionResponse.data.payment_collection
                    // 7. Initialize payment session
                    await api.post(
                        `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
                        {
                            provider_id: "pp_system_default",
                        },
                        storeHeaders
                    )

                    // 8. Complete the cart using complete endpoint
                    const completeResponse = await api.post(
                        `/store/carts/${cart.id}/complete`,
                        {},
                        storeHeaders
                    )

                    expect(completeResponse.status).toEqual(200)
                    expect(completeResponse.data.type).toEqual("order_group")
                    expect(completeResponse.data.order_group).toBeDefined()
                    expect(completeResponse.data.order_group.id).toBeDefined()
                })

                it("should assign shipping methods to orders after cart completion", async () => {
                    // 1. Create cart
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

                    // 2. Add item to cart
                    const addItemResponse = await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )
                    cart = addItemResponse.data.cart

                    // 3. Set shipping address
                    const updateResponse = await api.post(
                        `/store/carts/${cart.id}`,
                        {
                            email: "shipping-assign@test.com",
                            shipping_address: {
                                metadata: { latitude: 12.9716, longitude: 77.5946 },
                                first_name: "Jane",
                                last_name: "Doe",
                                address_1: "456 Oak Ave",
                                city: "Los Angeles",
                                country_code: "us",
                                postal_code: "90001",
                            },
                            billing_address: {
                                first_name: "Jane",
                                last_name: "Doe",
                                address_1: "456 Oak Ave",
                                city: "Los Angeles",
                                country_code: "us",
                                postal_code: "90001",
                            },
                        },
                        storeHeaders
                    )
                    cart = updateResponse.data.cart

                    // 4. Get shipping options and add shipping method
                    const shippingOptionsResponse = await api.get(
                        `/store/shipping-options?cart_id=${cart.id}`,
                        storeHeaders
                    )
                    const allShippingOptions = Object.values(
                        shippingOptionsResponse.data.shipping_options as Record<string, any[]>
                    ).flat()
                    expect(allShippingOptions.length).toBeGreaterThan(0)

                    const addShippingResponse = await api.post(
                        `/store/carts/${cart.id}/shipping-methods`,
                        {
                            option_id: allShippingOptions[0].id,
                        },
                        storeHeaders
                    )
                    cart = addShippingResponse.data.cart
                    expect(cart.shipping_methods.length).toEqual(1)

                    const selectedShippingOptionId = allShippingOptions[0].id

                    // 5. Create payment collection and session
                    const paymentCollectionResponse = await api.post(
                        `/store/payment-collections`,
                        { cart_id: cart.id },
                        storeHeaders
                    )
                    const paymentCollection = paymentCollectionResponse.data.payment_collection

                    await api.post(
                        `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
                        { provider_id: "pp_system_default" },
                        storeHeaders
                    )

                    // 6. Complete the cart
                    const completeResponse = await api.post(
                        `/store/carts/${cart.id}/complete`,
                        {},
                        storeHeaders
                    )

                    expect(completeResponse.status).toEqual(200)
                    expect(completeResponse.data.type).toEqual("order_group")

                    const orderGroupId = completeResponse.data.order_group.id

                    // 7. Query orders via query graph to verify shipping methods
                    const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
                    const { data: orderGroup } = await query.graph({
                        entity: "order_group",
                        filters: { id: orderGroupId },
                        fields: [
                            "id",
                            "orders.*",
                            "orders.shipping_methods.*",
                        ],
                    })

                    const orders = orderGroup[0].orders
                    expect(orders.length).toBeGreaterThan(0)

                    // Verify each order has shipping methods assigned
                    for (const order of orders) {
                        expect(order.shipping_methods).toBeDefined()
                        expect(order.shipping_methods.length).toBeGreaterThan(0)
                        expect(order.shipping_methods[0].shipping_option_id).toEqual(selectedShippingOptionId)
                    }
                })

                it("should add multiple items from different variants", async () => {
                    // Create cart
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

                    // Add first variant
                    await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )

                    // Add second variant
                    const addSecondResponse = await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[1].id,
                            quantity: 2,
                        },
                        storeHeaders
                    )

                    expect(addSecondResponse.data.cart.items).toHaveLength(2)
                })

                it("should update line item quantity", async () => {
                    // Create cart with item
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

                    const addItemResponse = await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )
                    const lineItemId = addItemResponse.data.cart.items[0].id

                    // Update quantity
                    const updateResponse = await api.post(
                        `/store/carts/${cart.id}/line-items/${lineItemId}`,
                        {
                            quantity: 5,
                        },
                        storeHeaders
                    )

                    expect(updateResponse.data.cart.items[0].quantity).toEqual(5)
                })

                it("should remove line item from cart", async () => {
                    // Create cart with item
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

                    const addItemResponse = await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )
                    const lineItemId = addItemResponse.data.cart.items[0].id

                    // Remove item
                    const deleteResponse = await api.delete(
                        `/store/carts/${cart.id}/line-items/${lineItemId}`,
                        storeHeaders
                    )

                    expect(deleteResponse.data.parent.items).toHaveLength(0)
                })

                it("should create cart with customer authentication", async () => {
                    // Create cart with customer headers (authenticated)
                    const response = await api.post(
                        `/store/carts`,
                        {
                            region_id: region.id,
                            sales_channel_id: salesChannel.id,
                            currency_code: "usd",
                        },
                        {
                            headers: {
                                ...storeHeaders.headers,
                                ...customerHeaders.headers,
                            },
                        }
                    )

                    expect(response.status).toEqual(200)
                    expect(response.data.cart).toBeDefined()
                })
            })

            describe("Promotions/Discounts", () => {
                it("should apply seller promotion only to that seller's items", async () => {
                    // Create promotion for seller (10% off order)
                    const promotionResponse = await api.post(
                        `/vendor/promotions`,
                        {
                            code: "SELLER10",
                            type: "standard",
                            status: "active",
                            application_method: {
                                type: "percentage",
                                target_type: "order",
                                value: 10,
                            },
                        },
                        sellerHeaders
                    )
                    expect(promotionResponse.status).toEqual(200)

                    // Create cart with item
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

                    // Add item to cart (item price: $20.00)
                    const addItemResponse = await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )
                    cart = addItemResponse.data.cart

                    // Apply promotion
                    const promoResponse = await api.post(
                        `/store/carts/${cart.id}/promotions`,
                        {
                            promo_codes: ["SELLER10"],
                        },
                        storeHeaders
                    )

                    expect(promoResponse.status).toEqual(200)
                    cart = promoResponse.data.cart

                    // Verify discount was applied
                    expect(cart.items[0].adjustments).toBeDefined()
                    expect(cart.items[0].adjustments.length).toBeGreaterThan(0)
                    expect(cart.items[0].adjustments[0].code).toEqual("SELLER10")
                    expect(cart.items[0].adjustments[0].amount).toBeGreaterThan(0)
                })


            })

            describe("Shipping Options", () => {
                it("should return shipping options grouped by seller", async () => {
                    // Create cart with item
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

                    // Add item to cart
                    await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )

                    // Update cart with shipping address
                    await api.post(
                        `/store/carts/${cart.id}`,
                        {
                            email: "shipping@test.com",
                            shipping_address: {
                                metadata: { latitude: 12.9716, longitude: 77.5946 },
                                first_name: "John",
                                last_name: "Doe",
                                address_1: "123 Main St",
                                city: "New York",
                                country_code: "us",
                                postal_code: "10001",
                            },
                        },
                        storeHeaders
                    )

                    // Get shipping options
                    const shippingOptionsResponse = await api.get(
                        `/store/shipping-options?cart_id=${cart.id}`,
                        storeHeaders
                    )

                    expect(shippingOptionsResponse.status).toEqual(200)
                    expect(shippingOptionsResponse.data.shipping_options).toBeDefined()

                    // Verify response is a map with seller IDs as keys
                    const shippingOptions = shippingOptionsResponse.data.shipping_options
                    expect(typeof shippingOptions).toBe("object")

                    // Verify the seller has shipping options
                    expect(shippingOptions[seller.id]).toBeDefined()
                    expect(Array.isArray(shippingOptions[seller.id])).toBe(true)
                    expect(shippingOptions[seller.id].length).toBeGreaterThan(0)
                })

                it("should return correct shipping option details for seller", async () => {
                    // Create cart with item
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

                    // Add item to cart
                    await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )

                    // Update cart with shipping address
                    await api.post(
                        `/store/carts/${cart.id}`,
                        {
                            email: "shipping@test.com",
                            shipping_address: {
                                metadata: { latitude: 12.9716, longitude: 77.5946 },
                                first_name: "John",
                                last_name: "Doe",
                                address_1: "123 Main St",
                                city: "New York",
                                country_code: "us",
                                postal_code: "10001",
                            },
                        },
                        storeHeaders
                    )

                    // Get shipping options
                    const shippingOptionsResponse = await api.get(
                        `/store/shipping-options?cart_id=${cart.id}`,
                        storeHeaders
                    )

                    const sellerShippingOptions = shippingOptionsResponse.data.shipping_options[seller.id]
                    expect(sellerShippingOptions).toBeDefined()

                    // Find our created shipping option
                    const foundOption = sellerShippingOptions.find(
                        (opt: any) => opt.id === shippingOption.id
                    )
                    expect(foundOption).toBeDefined()
                    expect(foundOption.name).toEqual("Standard Shipping")
                    expect(foundOption.price_type).toEqual("flat")
                    expect(foundOption.amount).toBeDefined()
                })


                it("should only return shipping options for sellers with items in cart", async () => {
                    // Create a second seller with shipping but no items in cart
                    const seller2Result = await createSellerUser(appContainer, {
                        email: "seller3@test.com",
                        name: "Test Seller 3",
                    })
                    const seller2Headers = seller2Result.headers

                    // Create shipping prerequisites for seller 2 (but don't add products to cart)
                    const shippingPrerequisites2 = await createShippingPrerequisites(seller2Headers)

                    // Create shipping option for seller 2
                    await api.post(
                        `/vendor/shipping-options`,
                        {
                            name: "Seller 3 Shipping",
                            service_zone_id: shippingPrerequisites2.serviceZone.id,
                            shipping_profile_id: shippingPrerequisites2.shippingProfile.id,
                            provider_id: "manual_manual",
                            price_type: "flat",
                            type: {
                                label: "Standard",
                                description: "Standard shipping",
                                code: "standard",
                            },
                            prices: [{ currency_code: "usd", amount: 700 }],
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

                    // Create cart with only seller 1's item
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

                    // Add item from seller 1 only
                    await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )

                    // Update cart with shipping address
                    await api.post(
                        `/store/carts/${cart.id}`,
                        {
                            email: "singleseller@test.com",
                            shipping_address: {
                                metadata: { latitude: 12.9716, longitude: 77.5946 },
                                first_name: "John",
                                last_name: "Doe",
                                address_1: "123 Main St",
                                city: "New York",
                                country_code: "us",
                                postal_code: "10001",
                            },
                        },
                        storeHeaders
                    )

                    // Get shipping options
                    const shippingOptionsResponse = await api.get(
                        `/store/shipping-options?cart_id=${cart.id}`,
                        storeHeaders
                    )

                    expect(shippingOptionsResponse.status).toEqual(200)

                    const shippingOptions = shippingOptionsResponse.data.shipping_options

                    // Verify only seller 1 has shipping options (seller 3 has no items in cart)
                    expect(shippingOptions[seller.id]).toBeDefined()
                    expect(Object.keys(shippingOptions)).toHaveLength(1)
                })

                it("should include calculated price in shipping options", async () => {
                    // Create cart with item
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

                    // Add item to cart
                    await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )

                    // Update cart with shipping address
                    await api.post(
                        `/store/carts/${cart.id}`,
                        {
                            email: "pricing@test.com",
                            shipping_address: {
                                metadata: { latitude: 12.9716, longitude: 77.5946 },
                                first_name: "John",
                                last_name: "Doe",
                                address_1: "123 Main St",
                                city: "New York",
                                country_code: "us",
                                postal_code: "10001",
                            },
                        },
                        storeHeaders
                    )

                    // Get shipping options
                    const shippingOptionsResponse = await api.get(
                        `/store/shipping-options?cart_id=${cart.id}`,
                        storeHeaders
                    )

                    const sellerShippingOptions = shippingOptionsResponse.data.shipping_options[seller.id]
                    expect(sellerShippingOptions).toBeDefined()
                    expect(sellerShippingOptions.length).toBeGreaterThan(0)

                    // Verify price is calculated
                    const option = sellerShippingOptions[0]
                    expect(option.amount).toBeDefined()
                    expect(typeof option.amount).toBe("number")
                    expect(option.amount).toEqual(500) // The price we set for Standard Shipping
                })
            })

            describe("Shipping Methods", () => {
                it("should add a shipping method to cart", async () => {
                    // Create cart with item
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

                    // Add item to cart
                    await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )

                    // Update cart with shipping address
                    await api.post(
                        `/store/carts/${cart.id}`,
                        {
                            email: "shipping-method@test.com",
                            shipping_address: {
                                metadata: { latitude: 12.9716, longitude: 77.5946 },
                                first_name: "John",
                                last_name: "Doe",
                                address_1: "123 Main St",
                                city: "New York",
                                country_code: "us",
                                postal_code: "10001",
                            },
                        },
                        storeHeaders
                    )

                    // Get shipping options
                    const shippingOptionsResponse = await api.get(
                        `/store/shipping-options?cart_id=${cart.id}`,
                        storeHeaders
                    )

                    const sellerShippingOptions = shippingOptionsResponse.data.shipping_options[seller.id]
                    expect(sellerShippingOptions.length).toBeGreaterThan(0)

                    // Add shipping method
                    const addShippingResponse = await api.post(
                        `/store/carts/${cart.id}/shipping-methods`,
                        {
                            option_id: sellerShippingOptions[0].id,
                        },
                        storeHeaders
                    )

                    expect(addShippingResponse.status).toEqual(200)
                    cart = addShippingResponse.data.cart
                    expect(cart.shipping_methods).toBeDefined()
                    expect(cart.shipping_methods.length).toEqual(1)
                    expect(cart.shipping_methods[0].shipping_option_id).toEqual(sellerShippingOptions[0].id)
                })

                it("should replace seller's shipping method when adding a new one for the same seller", async () => {
                    // Create a second shipping option for the same seller
                    const shippingPrerequisites = await createShippingPrerequisites(sellerHeaders)
                    const secondShippingOptionResponse = await api.post(
                        `/vendor/shipping-options`,
                        {
                            name: "Express Shipping",
                            service_zone_id: shippingPrerequisites.serviceZone.id,
                            shipping_profile_id: shippingPrerequisites.shippingProfile.id,
                            provider_id: "manual_manual",
                            price_type: "flat",
                            type: {
                                label: "Express",
                                description: "Express shipping",
                                code: "express",
                            },
                            prices: [{ currency_code: "usd", amount: 1500 }],
                            rules: [
                                {
                                    attribute: "enabled_in_store",
                                    value: "true",
                                    operator: "eq",
                                },
                            ],
                        },
                        sellerHeaders
                    )
                    const secondShippingOption = secondShippingOptionResponse.data.shipping_option

                    // Create cart with item
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

                    // Add item to cart
                    await api.post(
                        `/store/carts/${cart.id}/line-items`,
                        {
                            variant_id: product.variants[0].id,
                            quantity: 1,
                        },
                        storeHeaders
                    )

                    // Update cart with shipping address
                    await api.post(
                        `/store/carts/${cart.id}`,
                        {
                            email: "replace-shipping@test.com",
                            shipping_address: {
                                metadata: { latitude: 12.9716, longitude: 77.5946 },
                                first_name: "John",
                                last_name: "Doe",
                                address_1: "123 Main St",
                                city: "New York",
                                country_code: "us",
                                postal_code: "10001",
                            },
                        },
                        storeHeaders
                    )

                    // Add first shipping method (Standard Shipping)
                    const addFirstResponse = await api.post(
                        `/store/carts/${cart.id}/shipping-methods`,
                        {
                            option_id: shippingOption.id,
                        },
                        storeHeaders
                    )
                    cart = addFirstResponse.data.cart
                    expect(cart.shipping_methods.length).toEqual(1)
                    expect(cart.shipping_methods[0].shipping_option_id).toEqual(shippingOption.id)

                    // Add second shipping method (Express Shipping) - should replace the first one
                    const addSecondResponse = await api.post(
                        `/store/carts/${cart.id}/shipping-methods`,
                        {
                            option_id: secondShippingOption.id,
                        },
                        storeHeaders
                    )
                    cart = addSecondResponse.data.cart

                    // Verify only the new shipping method exists (previous one removed)
                    expect(cart.shipping_methods.length).toEqual(1)
                    expect(cart.shipping_methods[0].shipping_option_id).toEqual(secondShippingOption.id)
                })


            })
        })
    },
})
