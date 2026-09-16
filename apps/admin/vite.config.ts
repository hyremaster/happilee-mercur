import { resolve } from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { mercurDashboardPlugin } from '@mercurjs/dashboard-sdk'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl =
    env.VITE_MERCUR_BACKEND_URL || env.MERCUR_BACKEND_URL
  const vendorUrl =
    env.VITE_MERCUR_VENDOR_URL || env.MERCUR_VENDOR_URL

  return {
    plugins: [
      react(),
      mercurDashboardPlugin({
        medusaConfigPath: '../api/medusa-config.ts',
        ...(backendUrl ? { backendUrl } : {}),
        ...(vendorUrl ? { vendorUrl } : {}),
      }),
    ],
    resolve: {
      alias: {
        // @mercurjs/types ships CommonJS (a runtime __exportStar barrel) whose
        // named exports esbuild/cjs-lexer can't statically detect, so importing
        // a *value* like the SellerStatus enum fails with "does not provide an
        // export named ...". Resolve the package to its TS source so Vite gets
        // real ESM named exports. Type-only imports (HttpTypes) resolve here too.
        '@mercurjs/types': resolve(__dirname, '../../packages/types/src/index.ts'),
      },
    },
  }
})
