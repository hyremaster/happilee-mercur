import { loadEnv } from '@medusajs/framework/utils'
import { withMercur } from '@mercurjs/core'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = withMercur({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      vendorCors: process.env.VENDOR_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    // Vendor/admin auth rides a session cookie (SPA uses credentials:'include'),
    // so THIS governs how long a login lasts — not jwtExpiresIn. Default 1h,
    // with rolling refresh so active users aren't logged out mid-session; only
    // 1h of inactivity ends it. Env-tunable.
    sessionOptions: {
      ttl: Number(process.env.SESSION_TTL_MS) || 60 * 60 * 1000,
      rolling: true,
    }
  },
  featureFlags: {
    seller_registration: true
  },
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "@mercurjs/payment-razorpay",
            id: "razorpay",
          },
        ],
      },
    },
    {
      resolve: '@mercurjs/core/modules/admin-ui',
      options: {
        appDir: '',
        path: '/dashboard',
        disable: true
      }
    },
    {
      resolve: '@mercurjs/core/modules/vendor-ui',
      options: {
        appDir: '',
        path: '/seller',
        disable: true
      }
    },
  ],
})
