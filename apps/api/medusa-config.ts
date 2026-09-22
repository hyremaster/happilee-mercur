import { loadEnv } from '@medusajs/framework/utils'
import { withMercur } from '@mercurjs/core'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

/**
 * File storage provider.
 *
 * Uploads (product/seller images, CSV imports, etc.) go to AWS S3 when a bucket
 * is configured, otherwise fall back to local disk (dev convenience).
 *
 * S3 credentials resolve in two tiers, per the deploy requirement:
 *   1. Explicit env keys — S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY (access-key
 *      auth). Used when both are present.
 *   2. Fallback — no keys => "s3-iam-role" auth, so the AWS SDK's default
 *      credential chain (i.e. the EC2 instance role) is used. Region + bucket
 *      still come from env.
 */
const s3Bucket = process.env.S3_BUCKET
const s3Region = process.env.S3_REGION || process.env.AWS_REGION
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY
const useAccessKey = !!(s3AccessKeyId && s3SecretAccessKey)

// Only register a custom file module when S3 is configured. Without a bucket we
// leave Medusa's built-in local-disk default in place (dev convenience), so no
// extra provider package is needed for local runs.
const fileModules = s3Bucket
  ? [
      {
        resolve: '@medusajs/medusa/file',
        options: {
          providers: [
            {
              resolve: '@medusajs/file-s3',
              id: 's3',
              options: {
                // Env keys first; otherwise let the SDK use the EC2 instance role.
                authentication_method: useAccessKey
                  ? 'access-key'
                  : 's3-iam-role',
                access_key_id: useAccessKey ? s3AccessKeyId : undefined,
                secret_access_key: useAccessKey ? s3SecretAccessKey : undefined,
                region: s3Region,
                bucket: s3Bucket,
                // Public base URL objects are served from (bucket URL or a CDN).
                file_url:
                  process.env.S3_FILE_URL ||
                  `https://${s3Bucket}.s3.${s3Region}.amazonaws.com`,
                // Optional: custom endpoint (S3-compatible) + key prefix.
                endpoint: process.env.S3_ENDPOINT || undefined,
                prefix: process.env.S3_PREFIX || undefined,
              },
            },
          ],
        },
      },
    ]
  : []

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
    ...fileModules,
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
