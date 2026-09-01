import { validateAndTransformBody } from "@medusajs/framework/http"
import { MiddlewareRoute } from "@medusajs/medusa"

import {
  StoreSendPhoneOtp,
  StoreVerifyPhoneOtp,
} from "./phone/validators"

export const storeAuthMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/store/auth/phone/send-otp",
    middlewares: [validateAndTransformBody(StoreSendPhoneOtp)],
  },
  {
    method: ["POST"],
    matcher: "/store/auth/phone/verify-otp",
    middlewares: [validateAndTransformBody(StoreVerifyPhoneOtp)],
  },
]
