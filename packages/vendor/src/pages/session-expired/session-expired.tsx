import { ArrowRight } from "@happilee-app/icons"
import { useEffect } from "react"
import { HourglassIcon } from "../../icons"
import { getHappileeMyAppsUrl } from "../../lib/happilee-auth"
import { StoreSetupLayout } from "../onboard/_components/store-setup-layout"

export const SessionExpiredPage = () => {
  const myAppsUrl = getHappileeMyAppsUrl()

  useEffect(() => {
    window.localStorage.removeItem("medusa_auth_token")
  }, [])

  return (
    <StoreSetupLayout
      minHeight="h-[calc(100vh-16px)]"
      contentClassName="min-h-0 items-center justify-center"
    >
      <div className="flex flex-col items-center justify-center gap-3xl text-center">
        <div className="flex flex-col items-center gap-xl">
          <HourglassIcon />
          <div className="flex flex-col items-center gap-xs">
            <p className="text-md font-semibold text-text-primary">
              Login session expired.
            </p>
            <p className="whitespace-nowrap text-sm text-text-tertiary">
              Your login session is no longer valid. Please sign in again to continue.
            </p>
          </div>
        </div>
        <a
          href={myAppsUrl}
          data-testid="session-expired-sign-in"
          className="inline-flex items-center gap-sm text-sm font-semibold text-text-brand transition-opacity hover:opacity-80"
        >
          Sign In Again
          <ArrowRight size={16} aria-hidden />
        </a>
      </div>
    </StoreSetupLayout>
  )
}
