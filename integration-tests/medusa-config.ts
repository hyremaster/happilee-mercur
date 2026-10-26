import path from 'path'
import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  featureFlags: {
    rbac: true,
    seller_registration: true
  },
  modules: [
    {
      resolve: "@medusajs/medusa/rbac",
    },
    // Store integrations: a test provider plus the real GoFrugal provider
    // (its tests point it at a local mock server, never at GoFrugal).
    {
      resolve: '@mercurjs/core/modules/integration',
      options: {
        providers: [
          {
            resolve: path.join(__dirname, 'providers', 'test-integration'),
            id: 'test-integration',
          },
          {
            resolve: '@mercurjs/integration-gofrugal',
            id: 'gofrugal',
            options: { timeout_ms: 3000 },
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
    // Meilisearch block — loaded only when env vars are present (e.g. meilisearch integration tests)
    ...(process.env.MEILISEARCH_HOST ? [{
      resolve: '../packages/registry/src/meilisearch/modules/meilisearch',
      options: {
        host: process.env.MEILISEARCH_HOST,
        apiKey: process.env.MEILISEARCH_API_KEY,
      },
    }] : []),
  ],
  plugins: [
    {
      resolve: "@mercurjs/core",
      options: {}
    }
  ]
})
