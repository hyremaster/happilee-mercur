import { existsSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { mercurDashboardPlugin } from '@mercurjs/dashboard-sdk'

const defaultHappileeUiPath = resolve(
  __dirname,
  '../../../../Ecommerce components/happilee-ui/packages/ui',
)

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl =
    env.VITE_MERCUR_BACKEND_URL || env.MERCUR_BACKEND_URL
  const vendorRoot = resolve(__dirname, '../../packages/vendor')
  const vendorSrc = resolve(vendorRoot, 'src')
  const useVendorSource = mode === 'development'

  const happileeUiPath = env.VITE_HAPPILEE_UI_PATH
    ? resolve(env.VITE_HAPPILEE_UI_PATH)
    : defaultHappileeUiPath
  const useLocalHappileeUi =
    useVendorSource &&
    existsSync(resolve(happileeUiPath, 'dist/index.js'))

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

  const happileeUiAliases = useLocalHappileeUi
    ? {
        '@happilee-app/ui/styles.css': resolve(
          happileeUiPath,
          'dist/styles.css',
        ),
        '@happilee-app/ui/ecommerce': resolve(
          happileeUiPath,
          'dist/ecommerce.js',
        ),
        '@happilee-app/ui': resolve(happileeUiPath, 'dist/index.js'),
      }
    : {}

  return {
    plugins: [
      react(),
      tailwindcss(),
      mercurDashboardPlugin({
        medusaConfigPath: '../api/medusa-config.ts',
        ...(backendUrl ? { backendUrl } : {}),
        // "Complete store profile" banner removed: no StoreSetup override is
        // registered, so shell.tsx / store-detail-page render nothing for it.
      }),
    ],
    resolve: {
      alias: {
        '@': vendorSrc,
        // @mercurjs/types ships CommonJS (a runtime __exportStar barrel) whose
        // named exports esbuild/cjs-lexer can't statically detect, so importing
        // a *value* like the SellerStatus enum fails with "does not provide an
        // export named ...". Resolve the package to its TS source so Vite gets
        // real ESM named exports. Type-only imports (HttpTypes) resolve here too.
        '@mercurjs/types': resolve(__dirname, '../../packages/types/src/index.ts'),
        // @tailwindcss/vite resolves CSS imports with "style" condition which
        // @medusajs/dashboard doesn't export — bypass by pointing to actual file
        '@medusajs/dashboard/css': resolve(__dirname, '../../packages/vendor/node_modules/@medusajs/dashboard/dist/app.css'),
        ...happileeUiAliases,
        ...vendorSourceAliases,
      },
    },
    server: {
      fs: {
        allow: useLocalHappileeUi
          ? [resolve(__dirname, '../..'), happileeUiPath]
          : [resolve(__dirname, '../..')],
      },
    },
    optimizeDeps: {
      include: useLocalHappileeUi
        ? ['@happilee-app/icons']
        : [
            '@happilee-app/ui',
            '@happilee-app/ui/ecommerce',
            '@happilee-app/icons',
          ],
      exclude: useLocalHappileeUi
        ? ['@happilee-app/ui', '@happilee-app/ui/ecommerce']
        : [],
    },
  }
})
