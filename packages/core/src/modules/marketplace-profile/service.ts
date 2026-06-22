import { DAL } from "@medusajs/framework/types"
import { MedusaService } from "@medusajs/framework/utils"
import {
  StoreProfile,
  StoreOrderStatus,
  StorePaymentConfig,
  StoreLocationDetail,
  MemberProfile,
} from "./models"

type InjectedDependencies = {
  baseRepository: DAL.RepositoryService
}

class MarketplaceProfileModuleService extends MedusaService({
  StoreProfile,
  StoreOrderStatus,
  StorePaymentConfig,
  StoreLocationDetail,
  MemberProfile,
}) {
  protected readonly baseRepository_: DAL.RepositoryService

  constructor({ baseRepository }: InjectedDependencies) {
    // @ts-ignore
    // eslint-disable-next-line prefer-rest-params
    super(...arguments)
    this.baseRepository_ = baseRepository
  }
}

export default MarketplaceProfileModuleService
