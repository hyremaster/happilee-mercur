import { DAL } from "@medusajs/framework/types"
import { MedusaService } from "@medusajs/framework/utils"
import type {
  CreateStoreOrderStatusDTO,
  StoreOrderStatusDTO,
  UpdateStoreOrderStatusDTO,
} from "@mercurjs/types"
import {
  StoreProfile,
  StoreOrderStatus,
  StorePaymentConfig,
  StoreLocationDetail,
  MemberProfile,
  StoreOnboardingDraft,
  StorefrontTemplate,
  StorePaymentGateway,
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
  StoreOnboardingDraft,
  StorefrontTemplate,
  StorePaymentGateway,
}) {
  protected readonly baseRepository_: DAL.RepositoryService

  // MedusaService pluralizes model names at runtime via `pluralize`, which turns
  // "StoreOrderStatus" into the correct "...Statuses" methods. Its type-level
  // pluralizer, however, mistypes "Status" as already-plural and exposes
  // singular names. Re-declare the real (runtime) methods with correct types.
  declare createStoreOrderStatuses: (
    data: CreateStoreOrderStatusDTO | CreateStoreOrderStatusDTO[]
  ) => Promise<StoreOrderStatusDTO[]>
  declare listStoreOrderStatuses: (
    filters?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<StoreOrderStatusDTO[]>
  declare updateStoreOrderStatuses: (
    data: (UpdateStoreOrderStatusDTO & { id: string }) | (UpdateStoreOrderStatusDTO & { id: string })[]
  ) => Promise<StoreOrderStatusDTO[]>
  declare deleteStoreOrderStatuses: (ids: string | string[]) => Promise<void>

  constructor({ baseRepository }: InjectedDependencies) {
    // @ts-ignore
    // eslint-disable-next-line prefer-rest-params
    super(...arguments)
    this.baseRepository_ = baseRepository
  }
}

export default MarketplaceProfileModuleService
