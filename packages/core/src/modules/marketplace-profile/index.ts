import { Module } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import MarketplaceProfileModuleService from "./service"

export default Module(MercurModules.MARKETPLACE_PROFILE, {
  service: MarketplaceProfileModuleService,
})
