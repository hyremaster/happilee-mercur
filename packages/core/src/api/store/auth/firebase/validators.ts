import { z } from "zod"

export type StoreFirebaseVerifyType = z.infer<typeof StoreFirebaseVerify>

// Body for POST /store/auth/firebase/verify. The Firebase JS SDK on the store-
// front performs the SMS OTP send + verify and hands the client this id_token.
export const StoreFirebaseVerify = z.object({
  id_token: z.string().min(1),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
})
