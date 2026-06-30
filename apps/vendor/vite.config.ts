import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { mercurDashboardPlugin } from '@mercurjs/dashboard-sdk'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl =
    env.VITE_MERCUR_BACKEND_URL || env.MERCUR_BACKEND_URL
  const vendorRoot = resolve(__dirname, '../../packages/vendor')
  const vendorSrc = resolve(vendorRoot, 'src')
  const useVendorSource = mode === 'development'

  const vendorSourceAliases = useVendorSource
    ? {
        '@mercurjs/vendor/index.css': resolve(vendorSrc, 'index.css'),
        '@mercurjs/vendor': resolve(vendorSrc, 'index.ts'),
        '@components': resolve(vendorSrc, 'components'),
        '@hooks': resolve(vendorSrc, 'hooks'),
        '@lib': resolve(vendorSrc, 'lib'),
        '@pages': resolve(vendorSrc, 'pages'),
        '@providers': resolve(vendorSrc, 'providers'),
        '@assets': resolve(vendorSrc, 'assets'),
      }
    : {}

  return {
    plugins: [
      react(),
      tailwindcss(),
      mercurDashboardPlugin({
        medusaConfigPath: '../api/medusa-config.ts',
        ...(backendUrl ? { backendUrl } : {}),
        components: {
          StoreSetup: 'components/store-setup/store-setup',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': vendorSrc,
        ...vendorSourceAliases,
      },
    },
    optimizeDeps: {
      include: [
        '@happilee-app/ui',
        '@happilee-app/ui/ecommerce',
        '@happilee-app/icons',
      ],
    },
  }
})
