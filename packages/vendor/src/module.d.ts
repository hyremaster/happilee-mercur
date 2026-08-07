declare const __BASE__: string

interface ImportMetaEnv {
  readonly VITE_AREA_SENSE_APP_URL?: string
  readonly VITE_MERCUR_BACKEND_URL?: string
  readonly [key: string]: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:mercur/routes" {
    import { Route } from './utils/routes'
    export const customRoutes: Route[]
}

declare module "virtual:mercur/config" {
    import { BuiltMercurConfig } from '@mercurjs/dashboard-sdk'
    const config: BuiltMercurConfig
    export default config
}

declare module "virtual:mercur/components" {
    import { ComponentType } from 'react'
    const components: Record<string, ComponentType>
    export default components
}

declare module "virtual:mercur/menu-items" {
    import { MenuItem } from './utils/routes'
    const menuItems: { menuItems: MenuItem[] }
    export default menuItems
}

declare module "virtual:mercur/i18n" {
    const i18nResources: Record<string, { translation: Record<string, any> }>
    export default i18nResources
}

